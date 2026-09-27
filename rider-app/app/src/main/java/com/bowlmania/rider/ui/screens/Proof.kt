package com.bowlmania.rider.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddAPhoto
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.bowlmania.rider.AppContainer
import com.bowlmania.rider.data.net.Delivery
import com.bowlmania.rider.location.Locations
import com.bowlmania.rider.ui.*
import com.bowlmania.rider.ui.components.*

class ProofVm(c: AppContainer, val orderId: Int) : LoadVm<Delivery>(c) {
    override suspend fun fetch() = c.repository.delivery(orderId)

    fun submit(photo: ByteArray?, signature: ByteArray?, note: String, onOk: (Delivery) -> Unit) = act("proof", {
        val loc = Locations.current(c.app, 4_000)
        c.repository.proof(orderId, photo, signature, note.trim(), keyFor("proof"), loc?.latitude, loc?.longitude)
    }) { d -> setData(d); onOk(d) }
}

/** Proof of delivery: doorstep photo, optional customer signature and a note. */
@Composable
fun ProofScreen(orderId: Int, nav: Nav) {
    val c = appContainer()
    val vm: ProofVm = viewModel(key = "proof$orderId") { ProofVm(c, orderId) }
    val st by vm.state.collectAsState()
    val busy by vm.busy.collectAsState()
    var photo by remember { mutableStateOf<ByteArray?>(null) }
    var camera by remember { mutableStateOf(false) }
    var note by remember { mutableStateOf("") }
    val signature = remember { SignatureState() }
    LaunchedEffect(Unit) { vm.load() }

    if (camera) {
        BackHandler { camera = false }
        CameraCapture(front = false, title = "Delivery photo", hint = "Show the order at the door or in the customer's hands.",
            onCaptured = { photo = it; camera = false }, onClose = { camera = false })
        return
    }

    Column(Modifier.fillMaxSize()) {
        AppBar("Proof of delivery", onBack = nav::back)
        val d = st.data
        when {
            d == null && st.loading -> Skeleton(3)
            d == null -> ErrorState(st.error ?: GENERIC_ERROR, { vm.load() })
            else -> {
                val req = d.requirements
                Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Text("#${d.orderNumber} · ${d.customer.name}", style = MaterialTheme.typography.titleMedium)
                    SectionCard(title = if (req.proofPhoto) "Photo (required)" else "Photo (optional)") {
                        val p = photo
                        if (p != null) PhotoPreview(p, onRetake = { camera = true })
                        else OutlinedButton(onClick = { camera = true }, modifier = Modifier.fillMaxWidth().heightIn(min = 72.dp)) {
                            Icon(Icons.Filled.AddAPhoto, null); Spacer(Modifier.width(10.dp)); Text("TAKE PHOTO")
                        }
                    }
                    SectionCard(title = if (req.signature) "Customer signature (required)" else "Customer signature (optional)",
                        trailing = { if (!signature.isEmpty) TextButton(onClick = signature::clear) { Text("Clear") } }) {
                        SignaturePad(signature)
                    }
                    SectionCard(title = "Note (optional)") {
                        OutlinedTextField(note, { note = it.take(500) }, placeholder = { Text("e.g. Left with security guard") }, modifier = Modifier.fillMaxWidth(), minLines = 2)
                    }
                }
                val missing = (req.proofPhoto && photo == null) || (req.signature && signature.isEmpty)
                Surface(tonalElevation = 3.dp, shadowElevation = 8.dp) {
                    Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(16.dp)) {
                        if (missing) Text(
                            if (req.proofPhoto && photo == null) "Take a photo to continue." else "Ask the customer to sign to continue.",
                            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(bottom = 8.dp),
                        )
                        BigButton("Submit proof", loading = busy == "proof", enabled = !missing && (photo != null || !signature.isEmpty || note.isNotBlank()), onClick = {
                            vm.submit(photo, signature.toPng(), note) { Snack.show("Proof saved"); nav.back() }
                        })
                    }
                }
            }
        }
    }
}
