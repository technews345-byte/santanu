package com.bowlmania.rider.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bowlmania.rider.domain.Stage
import com.bowlmania.rider.domain.Times
import com.bowlmania.rider.ui.theme.LocalStatus
import com.bowlmania.rider.ui.theme.Numeric
import kotlinx.coroutines.launch

/** Screen state: data (possibly from the offline cache), loading and a readable error. */
data class UiState<T>(val data: T? = null, val loading: Boolean = true, val error: String? = null, val cachedAt: Long? = null)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppBar(title: String, onBack: (() -> Unit)? = null, actions: @Composable RowScope.() -> Unit = {}) {
    TopAppBar(
        title = { Text(title, style = MaterialTheme.typography.titleLarge) },
        navigationIcon = { if (onBack != null) IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } },
        actions = actions,
        colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
    )
}

@Composable
fun OfflineBanner(online: Boolean) {
    AnimatedVisibility(!online, enter = expandVertically(), exit = shrinkVertically()) {
        Row(
            Modifier.fillMaxWidth().background(LocalStatus.current.warning).padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(Icons.Filled.CloudOff, null, tint = Color.White, modifier = Modifier.size(18.dp))
            Text("No internet connection. Showing saved information.", color = Color.White, style = MaterialTheme.typography.labelMedium)
        }
    }
}

@Composable
fun CachedNotice(cachedAt: Long?) {
    if (cachedAt == null) return
    Text(
        "Saved ${Times.ago(java.time.Instant.ofEpochMilli(cachedAt).toString())} · will update when you're back online",
        style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
    )
}

@Composable
fun Skeleton(lines: Int = 4, modifier: Modifier = Modifier) {
    val t = rememberInfiniteTransition(label = "skeleton")
    val a by t.animateFloat(0.35f, 0.75f, infiniteRepeatable(tween(900, easing = LinearEasing), RepeatMode.Reverse), label = "alpha")
    Column(modifier.padding(16.dp).semantics { contentDescription = "Loading" }, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        repeat(lines) { i ->
            Box(Modifier.fillMaxWidth(if (i % 3 == 2) 0.6f else 1f).height(if (i == 0) 110.dp else 64.dp).clip(RoundedCornerShape(18.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = a)))
        }
    }
}

@Composable
fun ErrorState(message: String, onRetry: () -> Unit, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Icon(Icons.Filled.ErrorOutline, null, tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(40.dp))
        Text(message, textAlign = TextAlign.Center, style = MaterialTheme.typography.bodyLarge)
        Button(onClick = onRetry, modifier = Modifier.height(48.dp)) { Text("RETRY") }
    }
}

@Composable
fun EmptyState(icon: ImageVector, title: String, text: String = "", modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth().padding(horizontal = 32.dp, vertical = 40.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Box(Modifier.size(64.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = MaterialTheme.colorScheme.onPrimaryContainer, modifier = Modifier.size(30.dp))
        }
        Text(title, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
        if (text.isNotBlank()) Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
    }
}

@Composable
fun StatusChip(label: String, color: Color, modifier: Modifier = Modifier) {
    Row(modifier.clip(CircleShape).background(color.copy(alpha = 0.14f)).padding(horizontal = 10.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Box(Modifier.size(7.dp).clip(CircleShape).background(color))
        Text(label, color = color, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
    }
}

@Composable
fun statusColor(status: String): Color {
    val s = LocalStatus.current
    return when (status) {
        "delivered", "completed", "present", "resolved", "approved", "working" -> s.online
        "cancelled", "rejected", "absent" -> s.danger
        "assigned", "pending", "late", "on_break", "open", "in_progress" -> s.warning
        "out_for_delivery", "at_customer", "otp_verified", "picked_up" -> s.info
        else -> MaterialTheme.colorScheme.primary
    }
}

@Composable
fun SectionCard(modifier: Modifier = Modifier, title: String? = null, trailing: @Composable (() -> Unit)? = null, content: @Composable ColumnScope.() -> Unit) {
    ElevatedCard(modifier.fillMaxWidth(), shape = MaterialTheme.shapes.large, colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 1.dp)) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (title != null) Row(verticalAlignment = Alignment.CenterVertically) {
                Text(title.uppercase(), style = MaterialTheme.typography.labelMedium, letterSpacing = 1.2.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                trailing?.invoke()
            }
            content()
        }
    }
}

@Composable
fun MetricTile(label: String, value: String, modifier: Modifier = Modifier, accent: Color = MaterialTheme.colorScheme.onSurface) {
    Column(modifier.clip(MaterialTheme.shapes.medium).background(MaterialTheme.colorScheme.surfaceContainer).padding(14.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(value, style = Numeric, color = accent)
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/** Big primary action: at least 56 dp high, easy to hit while on the move. */
@Composable
fun BigButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, loading: Boolean = false, enabled: Boolean = true,
              icon: ImageVector? = null, colors: ButtonColors = ButtonDefaults.buttonColors()) {
    Button(onClick = onClick, enabled = enabled && !loading, colors = colors, shape = MaterialTheme.shapes.medium,
        modifier = modifier.fillMaxWidth().heightIn(min = 58.dp)) {
        if (loading) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.5.dp, color = LocalContentColor.current)
        else {
            if (icon != null) { Icon(icon, null); Spacer(Modifier.width(10.dp)) }
            Text(text.uppercase(), style = MaterialTheme.typography.labelLarge, letterSpacing = 0.6.sp)
        }
    }
}

/** A button that only fires after being held for [holdMillis], so emergencies are never triggered by accident. */
@Composable
fun HoldToConfirmButton(text: String, color: Color, onConfirmed: () -> Unit, modifier: Modifier = Modifier, icon: ImageVector? = null, holdMillis: Int = 1500) {
    val progress = remember { Animatable(0f) }
    val scope = rememberCoroutineScope()
    val haptics = LocalHapticFeedback.current
    Box(
        modifier.fillMaxWidth().heightIn(min = 64.dp).clip(MaterialTheme.shapes.medium).background(color.copy(alpha = 0.12f))
            .border(2.dp, color, MaterialTheme.shapes.medium)
            .semantics { contentDescription = "$text. Press and hold to confirm." }
            .pointerInput(Unit) {
                detectTapGestures(onPress = {
                    val job = scope.launch {
                        progress.snapTo(0f)
                        progress.animateTo(1f, tween(holdMillis, easing = LinearEasing))
                        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                        onConfirmed()
                        progress.snapTo(0f)
                    }
                    tryAwaitRelease()
                    if (progress.value < 1f) { job.cancel(); scope.launch { progress.animateTo(0f, tween(200)) } }
                })
            },
        contentAlignment = Alignment.CenterStart,
    ) {
        Box(Modifier.fillMaxHeight().fillMaxWidth(progress.value).background(color.copy(alpha = 0.35f)))
        Row(Modifier.padding(horizontal = 18.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            if (icon != null) Icon(icon, null, tint = color)
            Column {
                Text(text, style = MaterialTheme.typography.titleMedium, color = color)
                Text("Press and hold", style = MaterialTheme.typography.labelSmall, color = color.copy(alpha = 0.8f))
            }
        }
    }
}

/** 4-digit code entry with large boxes, numeric keyboard and clear error feedback. */
@Composable
fun OtpDialog(title: String, subtitle: String, attemptsLeft: Int?, error: String?, loading: Boolean, onSubmit: (String) -> Unit, onDismiss: () -> Unit) {
    var code by remember { mutableStateOf("") }
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }
    LaunchedEffect(error) { if (error != null) code = "" }
    AlertDialog(
        onDismissRequest = { if (!loading) onDismiss() },
        title = { Text(title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Text(subtitle, style = MaterialTheme.typography.bodyMedium)
                BasicTextField(
                    value = code, onValueChange = { v -> code = v.filter(Char::isDigit).take(4); if (code.length == 4 && !loading) onSubmit(code) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                    modifier = Modifier.focusRequester(focus).semantics { contentDescription = "4-digit code" },
                    decorationBox = {
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            repeat(4) { i ->
                                val filled = i < code.length
                                val border by animateColorAsState(if (error != null) MaterialTheme.colorScheme.error else if (i == code.length) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant, label = "b")
                                Box(Modifier.size(56.dp).clip(RoundedCornerShape(14.dp)).border(2.dp, border, RoundedCornerShape(14.dp)), contentAlignment = Alignment.Center) {
                                    Text(if (filled) code[i].toString() else "", fontSize = 26.sp, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    },
                )
                if (error != null) Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
                else if (attemptsLeft != null) Text("$attemptsLeft ${if (attemptsLeft == 1) "try" else "tries"} left", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
        confirmButton = { Button(onClick = { onSubmit(code) }, enabled = code.length == 4 && !loading) { if (loading) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp) else Text("VERIFY") } },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !loading) { Text("Cancel") } },
    )
}

@Composable
fun StepTimeline(stages: List<Stage>) {
    val done = LocalStatus.current.online
    Column {
        stages.forEachIndexed { i, s ->
            Row(Modifier.height(IntrinsicSize.Min)) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width(28.dp)) {
                    Box(Modifier.size(22.dp).clip(CircleShape).background(if (s.done) done else Color.Transparent)
                        .border(2.dp, if (s.done || s.current) done else MaterialTheme.colorScheme.outlineVariant, CircleShape), contentAlignment = Alignment.Center) {
                        if (s.done) Icon(Icons.Filled.Check, null, tint = Color.White, modifier = Modifier.size(14.dp))
                    }
                    if (i < stages.lastIndex) Box(Modifier.width(2.dp).fillMaxHeight().background(if (s.done) done else MaterialTheme.colorScheme.outlineVariant))
                }
                Column(Modifier.padding(start = 10.dp, bottom = 14.dp)) {
                    Text(s.label, style = MaterialTheme.typography.bodyLarge, fontWeight = if (s.current) FontWeight.Bold else FontWeight.Normal,
                        color = if (s.done || s.current) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant)
                    if (s.time != null && s.done) Text(Times.clock(s.time), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
fun ConfirmDialog(title: String, text: String, confirm: String, onConfirm: () -> Unit, onDismiss: () -> Unit, destructive: Boolean = false) {
    AlertDialog(onDismissRequest = onDismiss, title = { Text(title) }, text = { Text(text) },
        confirmButton = { Button(onClick = onConfirm, colors = if (destructive) ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error) else ButtonDefaults.buttonColors()) { Text(confirm) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } })
}
