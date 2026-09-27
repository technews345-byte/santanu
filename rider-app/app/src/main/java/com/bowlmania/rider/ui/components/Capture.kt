package com.bowlmania.rider.ui.components

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path as AndroidPath
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.view.CameraController
import androidx.camera.view.LifecycleCameraController
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.bowlmania.rider.ui.Intents
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import kotlin.math.max

/**
 * Full-screen camera for delivery proof (back camera) and attendance selfies (front camera).
 * Photos are resized and compressed on the phone and kept only in memory until uploaded.
 */
@Composable
fun CameraCapture(front: Boolean, title: String, hint: String, onCaptured: (ByteArray) -> Unit, onClose: () -> Unit) {
    val ctx = LocalContext.current
    var granted by remember { mutableStateOf(ContextCompat.checkSelfPermission(ctx, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) }
    var denied by remember { mutableStateOf(false) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted = it; denied = !it }
    LaunchedEffect(Unit) { if (!granted) launcher.launch(Manifest.permission.CAMERA) }

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        if (granted) CameraPreview(front, onCaptured)
        else Column(Modifier.align(Alignment.Center).padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Camera access is needed to take this photo.", color = Color.White, textAlign = TextAlign.Center)
            if (denied) Button(onClick = { Intents.appSettings(ctx) }) { Text("OPEN SETTINGS") }
            else Button(onClick = { launcher.launch(Manifest.permission.CAMERA) }) { Text("ALLOW CAMERA") }
        }
        Row(Modifier.fillMaxWidth().statusBarsPadding().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onClose) { Icon(Icons.Filled.Close, "Close camera", tint = Color.White) }
            Column(Modifier.weight(1f)) {
                Text(title, color = Color.White, style = MaterialTheme.typography.titleMedium)
                Text(hint, color = Color.White.copy(alpha = 0.8f), style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
private fun BoxScope.CameraPreview(front: Boolean, onCaptured: (ByteArray) -> Unit) {
    val ctx = LocalContext.current
    val owner = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()
    var capturing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val controller = remember {
        LifecycleCameraController(ctx).apply {
            setEnabledUseCases(CameraController.IMAGE_CAPTURE)
            imageCaptureMode = ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY
        }
    }
    LaunchedEffect(front) {
        controller.cameraSelector = if (front) CameraSelector.DEFAULT_FRONT_CAMERA else CameraSelector.DEFAULT_BACK_CAMERA
    }
    DisposableEffect(owner) {
        controller.bindToLifecycle(owner)
        onDispose { controller.unbind() }
    }
    AndroidView(factory = { PreviewView(it).apply { this.controller = controller; scaleType = PreviewView.ScaleType.FILL_CENTER } }, modifier = Modifier.fillMaxSize())
    if (front) Box(Modifier.align(Alignment.Center).size(260.dp).border(3.dp, Color.White.copy(alpha = 0.7f), CircleShape))
    Column(Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 28.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        error?.let { Text(it, color = Color.White, modifier = Modifier.background(Color(0xAA000000)).padding(8.dp)) }
        FilledIconButton(
            onClick = {
                capturing = true; error = null
                controller.takePicture(ContextCompat.getMainExecutor(ctx), object : ImageCapture.OnImageCapturedCallback() {
                    override fun onCaptureSuccess(image: ImageProxy) {
                        scope.launch {
                            val bytes = withContext(Dispatchers.Default) { runCatching { image.use { toJpeg(it) } }.getOrNull() }
                            capturing = false
                            if (bytes != null) onCaptured(bytes) else error = "Couldn't save the photo. Try again."
                        }
                    }
                    override fun onError(exception: ImageCaptureException) { capturing = false; error = "Couldn't take the photo. Try again." }
                })
            },
            enabled = !capturing,
            modifier = Modifier.size(78.dp).semantics { contentDescription = "Take photo" },
            shape = CircleShape,
            colors = IconButtonDefaults.filledIconButtonColors(containerColor = Color.White, contentColor = Color.Black),
        ) {
            if (capturing) CircularProgressIndicator(Modifier.size(28.dp), color = Color.Black, strokeWidth = 3.dp)
            else Icon(Icons.Filled.CameraAlt, null, modifier = Modifier.size(34.dp))
        }
    }
}

private fun toJpeg(image: ImageProxy): ByteArray {
    val src = image.toBitmap()
    val scale = MAX_SIDE.toFloat() / max(src.width, src.height)
    val m = Matrix().apply {
        postRotate(image.imageInfo.rotationDegrees.toFloat())
        if (scale < 1f) postScale(scale, scale)
    }
    val out = Bitmap.createBitmap(src, 0, 0, src.width, src.height, m, true)
    return ByteArrayOutputStream().use { s -> out.compress(Bitmap.CompressFormat.JPEG, 82, s); s.toByteArray() }
}
private const val MAX_SIDE = 1440

/** Shows a captured photo with a retake option. */
@Composable
fun PhotoPreview(bytes: ByteArray, onRetake: () -> Unit, modifier: Modifier = Modifier) {
    val bmp = remember(bytes) { BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap() }
    Box(modifier.fillMaxWidth().height(220.dp).clip(MaterialTheme.shapes.medium).background(MaterialTheme.colorScheme.surfaceVariant)) {
        if (bmp != null) Image(bmp, "Captured photo", contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        FilledTonalButton(onClick = onRetake, modifier = Modifier.align(Alignment.BottomEnd).padding(10.dp)) {
            Icon(Icons.Filled.Refresh, null); Spacer(Modifier.width(6.dp)); Text("Retake")
        }
    }
}

/** Holds the strokes of a customer signature. */
class SignatureState {
    val strokes = mutableStateListOf<List<Offset>>()
    internal var current by mutableStateOf<List<Offset>>(emptyList())
    internal var size = IntSize.Zero
    val isEmpty: Boolean get() = strokes.isEmpty() && current.isEmpty()
    fun clear() { strokes.clear(); current = emptyList() }

    /** The signature as a black-on-white PNG, or null when nothing was drawn. */
    fun toPng(): ByteArray? {
        if (isEmpty || size.width == 0 || size.height == 0) return null
        val bmp = Bitmap.createBitmap(size.width, size.height, Bitmap.Config.ARGB_8888)
        val canvas = android.graphics.Canvas(bmp)
        canvas.drawColor(android.graphics.Color.WHITE)
        val paint = Paint().apply {
            color = android.graphics.Color.BLACK; strokeWidth = 6f; style = Paint.Style.STROKE
            strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND; isAntiAlias = true
        }
        strokes.forEach { s ->
            if (s.size == 1) canvas.drawPoint(s[0].x, s[0].y, paint)
            else canvas.drawPath(AndroidPath().apply { moveTo(s[0].x, s[0].y); s.drop(1).forEach { lineTo(it.x, it.y) } }, paint)
        }
        return ByteArrayOutputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it); it.toByteArray() }
    }
}

@Composable
fun SignaturePad(state: SignatureState, modifier: Modifier = Modifier) {
    val ink = Color(0xFF111111)
    Box(modifier.fillMaxWidth().height(200.dp).clip(MaterialTheme.shapes.medium).background(Color.White)
        .border(1.dp, MaterialTheme.colorScheme.outlineVariant, MaterialTheme.shapes.medium)) {
        if (state.isEmpty) Text("Customer signs here", color = Color.Gray, modifier = Modifier.align(Alignment.Center))
        Canvas(Modifier.fillMaxSize().onSizeChanged { state.size = it }
            .semantics { contentDescription = "Signature area" }
            .pointerInput(Unit) {
                detectDragGestures(
                    onDragStart = { state.current = listOf(it) },
                    onDragEnd = { state.strokes.add(state.current); state.current = emptyList() },
                    onDragCancel = { state.strokes.add(state.current); state.current = emptyList() },
                    onDrag = { change, _ -> state.current = state.current + change.position },
                )
            }) {
            (state.strokes + listOf(state.current)).filter { it.isNotEmpty() }.forEach { s ->
                val path = Path().apply { moveTo(s[0].x, s[0].y); s.drop(1).forEach { lineTo(it.x, it.y) } }
                drawPath(path, ink, style = Stroke(width = 6f, cap = StrokeCap.Round, join = StrokeJoin.Round))
            }
        }
    }
}
