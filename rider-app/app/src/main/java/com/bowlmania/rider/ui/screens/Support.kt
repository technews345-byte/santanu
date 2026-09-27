@file:OptIn(ExperimentalMaterial3Api::class)

package com.bowlmania.rider.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.bowlmania.rider.AppContainer
import com.bowlmania.rider.data.net.AppConfig
import com.bowlmania.rider.data.net.EmergencyResponse
import com.bowlmania.rider.data.net.Ticket
import com.bowlmania.rider.data.net.TicketSummary
import com.bowlmania.rider.domain.Times
import com.bowlmania.rider.location.Locations
import com.bowlmania.rider.ui.*
import com.bowlmania.rider.ui.components.*
import com.bowlmania.rider.ui.theme.LocalStatus
import kotlinx.coroutines.flow.MutableStateFlow

private val CATEGORIES = listOf(
    "delivery" to "Delivery issue", "customer" to "Customer issue", "restaurant" to "Restaurant issue", "order" to "Order issue",
    "cod" to "Payment / COD issue", "vehicle" to "Vehicle issue", "technical" to "Technical problem",
)

// ---------- Ticket list ----------
@Composable
fun SupportScreen(nav: Nav) {
    val c = appContainer()
    val ctx = LocalContext.current
    val vm: SimpleVm<List<TicketSummary>> = viewModel { SimpleVm(c) { repository.tickets() } }
    val cfg: SimpleVm<AppConfig> = viewModel(key = "config") { SimpleVm(c) { repository.config() } }
    val st by vm.state.collectAsState()
    val config by cfg.state.collectAsState()
    LaunchedEffect(Unit) { vm.load(silent = vm.state.value.data != null); cfg.load(true) }
    Scaffold(
        topBar = { AppBar("Help & support", onBack = nav::back) },
        floatingActionButton = { ExtendedFloatingActionButton(onClick = { nav.open("support/new") }, icon = { Icon(Icons.Filled.Add, null) }, text = { Text("New ticket") }) },
        containerColor = MaterialTheme.colorScheme.background,
    ) { pad ->
        LazyColumn(Modifier.padding(pad).fillMaxSize(), contentPadding = PaddingValues(16.dp, 8.dp, 16.dp, 96.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            config.data?.supportPhone?.takeIf { it.isNotBlank() }?.let { phone ->
                item {
                    SectionCard {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text("Kitchen support", style = MaterialTheme.typography.titleMedium)
                                Text(phone, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            FilledTonalButton(onClick = { Intents.dial(ctx, phone) }) { Icon(Icons.Filled.Call, null); Spacer(Modifier.width(6.dp)); Text("Call") }
                        }
                    }
                }
            }
            item { SectionTitle("Your tickets") }
            if (st.cachedAt != null) item { CachedNotice(st.cachedAt) }
            val list = st.data
            when {
                list == null && st.loading -> item { Skeleton(3) }
                list == null -> item { ErrorState(st.error ?: GENERIC_ERROR, { vm.load() }) }
                list.isEmpty() -> item { EmptyState(Icons.Filled.SupportAgent, "No tickets yet", "Report a problem with an order, the app or your vehicle. The kitchen team will reply here.") }
                else -> items(list, key = { it.id }) { t ->
                    SectionCard(Modifier.clickable { nav.open("ticket/${t.id}") }) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(t.subject, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                            StatusChip(t.status.replace('_', ' ').replaceFirstChar { it.uppercase() }, statusColor(t.status))
                        }
                        Text("${t.categoryLabel.ifBlank { t.category }} · ${Times.ago(t.updatedAt ?: t.createdAt)}${if (t.replies > 0) " · ${t.replies} replies" else ""}",
                            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

// ---------- New ticket ----------
class NewTicketVm(c: AppContainer) : LoadVm<Unit>(c) {
    override suspend fun fetch() = Result.success(com.bowlmania.rider.data.Loaded(Unit))
    fun submit(category: String, message: String, orderId: Int?, photo: ByteArray?, onOk: (Ticket) -> Unit) =
        act("send", { c.repository.createTicket(category, message.trim(), orderId, keyFor("send"), photo) }, onOk = onOk)
}

@Composable
fun NewTicketScreen(orderId: Int?, nav: Nav) {
    val c = appContainer()
    val vm: NewTicketVm = viewModel { NewTicketVm(c) }
    val busy by vm.busy.collectAsState()
    var category by remember { mutableStateOf(if (orderId != null) "delivery" else "technical") }
    var message by remember { mutableStateOf("") }
    var photo by remember { mutableStateOf<ByteArray?>(null) }
    var camera by remember { mutableStateOf(false) }
    var menu by remember { mutableStateOf(false) }

    if (camera) {
        BackHandler { camera = false }
        CameraCapture(false, "Attach a photo", "Show the problem clearly.", { photo = it; camera = false }, { camera = false })
        return
    }
    Column(Modifier.fillMaxSize()) {
        AppBar("Report a problem", onBack = nav::back)
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            if (orderId != null) Text("About order #$orderId", style = MaterialTheme.typography.titleMedium)
            ExposedDropdownMenuBox(expanded = menu, onExpandedChange = { menu = it }) {
                OutlinedTextField(
                    value = CATEGORIES.first { it.first == category }.second, onValueChange = {}, readOnly = true, label = { Text("Type of problem") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(menu) },
                    modifier = Modifier.fillMaxWidth().menuAnchor(MenuAnchorType.PrimaryNotEditable),
                )
                ExposedDropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    CATEGORIES.forEach { (k, l) -> DropdownMenuItem(text = { Text(l) }, onClick = { category = k; menu = false }) }
                }
            }
            OutlinedTextField(message, { message = it.take(2000) }, label = { Text("What happened?") }, minLines = 4, modifier = Modifier.fillMaxWidth())
            val p = photo
            if (p != null) PhotoPreview(p, onRetake = { camera = true })
            else OutlinedButton(onClick = { camera = true }, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) {
                Icon(Icons.Filled.AddAPhoto, null); Spacer(Modifier.width(8.dp)); Text("ADD PHOTO (OPTIONAL)")
            }
            Text("For accidents or threats, use Safety & emergency instead — it alerts the kitchen immediately.",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Surface(tonalElevation = 3.dp) {
            BigButton("Send", loading = busy == "send", enabled = message.trim().length >= 3, modifier = Modifier.navigationBarsPadding().padding(16.dp), onClick = {
                vm.submit(category, message, orderId, photo) { t -> Snack.show("Ticket sent. We'll reply here."); nav.replace("ticket/${t.id}") }
            })
        }
    }
}

// ---------- Ticket conversation ----------
class TicketVm(c: AppContainer, val id: Int) : LoadVm<Ticket>(c) {
    override suspend fun fetch() = c.repository.ticket(id)
    fun reply(text: String, onOk: () -> Unit) = act("reply", { c.repository.reply(id, text.trim()) }) { setData(it); onOk() }
}

@Composable
fun TicketScreen(id: Int, nav: Nav) {
    val c = appContainer()
    val vm: TicketVm = viewModel(key = "ticket$id") { TicketVm(c, id) }
    val st by vm.state.collectAsState()
    val busy by vm.busy.collectAsState()
    var text by remember { mutableStateOf("") }
    val list = rememberLazyListState()
    LaunchedEffect(Unit) { vm.load() }
    LaunchedEffect(st.data?.messages?.size) { st.data?.messages?.size?.let { if (it > 0) list.animateScrollToItem(it - 1) } }

    Column(Modifier.fillMaxSize().imePadding()) {
        AppBar(st.data?.subject ?: "Ticket", onBack = nav::back)
        CachedNotice(st.cachedAt)
        val t = st.data
        when {
            t == null && st.loading -> Skeleton(3)
            t == null -> ErrorState(st.error ?: GENERIC_ERROR, { vm.load() })
            else -> {
                Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    StatusChip(t.status.replace('_', ' ').replaceFirstChar { it.uppercase() }, statusColor(t.status))
                    Text("#${t.id} · ${t.categoryLabel}${t.orderNumber?.let { " · order $it" } ?: ""}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                LazyColumn(Modifier.weight(1f), state = list, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(t.messages, key = { it.id }) { m ->
                        val mine = m.fromRider == 1
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start) {
                            Surface(color = if (mine) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceContainerHigh,
                                shape = MaterialTheme.shapes.medium, modifier = Modifier.widthIn(max = 300.dp)) {
                                Column(Modifier.padding(12.dp)) {
                                    if (!mine) Text(m.author ?: "Kitchen team", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                                    Text(m.body)
                                    if (m.hasAttachment == 1) Text("📎 Photo attached", style = MaterialTheme.typography.labelSmall)
                                    Text(Times.ago(m.createdAt), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    }
                }
                if (t.status != "closed") Row(Modifier.fillMaxWidth().navigationBarsPadding().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(text, { text = it.take(2000) }, placeholder = { Text("Write a reply") }, modifier = Modifier.weight(1f), maxLines = 4)
                    Spacer(Modifier.width(8.dp))
                    FilledIconButton(onClick = { vm.reply(text) { text = "" } }, enabled = text.isNotBlank() && busy == null, modifier = Modifier.size(52.dp)) {
                        if (busy == "reply") CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp) else Icon(Icons.AutoMirrored.Filled.Send, "Send reply")
                    }
                }
            }
        }
    }
}

// ---------- Safety & emergency ----------
class SafetyVm(c: AppContainer) : LoadVm<AppConfig>(c) {
    val sent = MutableStateFlow<EmergencyResponse?>(null)
    override suspend fun fetch() = c.repository.config()
    fun send(type: String, message: String, orderId: Int?) = act("sos:$type", {
        val loc = Locations.current(c.app, 6_000)
        c.repository.emergency(type, message.trim(), orderId, keyFor("sos:$type"), loc?.latitude, loc?.longitude)
    }) { sent.value = it }
}

@Composable
fun SafetyScreen(orderId: Int?, nav: Nav) {
    val c = appContainer()
    val ctx = LocalContext.current
    val vm: SafetyVm = viewModel { SafetyVm(c) }
    val cfg by vm.state.collectAsState()
    val busy by vm.busy.collectAsState()
    val sent by vm.sent.collectAsState()
    var message by remember { mutableStateOf("") }
    val s = LocalStatus.current
    LaunchedEffect(Unit) { vm.load(true) }
    val emergencyNumber = sent?.emergencyNumber ?: cfg.data?.emergencyNumber ?: "112"
    val supportPhone = sent?.supportPhone?.takeIf { it.isNotBlank() } ?: cfg.data?.supportPhone.orEmpty()

    Column(Modifier.fillMaxSize()) {
        AppBar("Safety & emergency", onBack = nav::back)
        Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            if (sent != null) Surface(color = s.online.copy(alpha = 0.14f), shape = MaterialTheme.shapes.large) {
                Column(Modifier.padding(18.dp).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Alert sent", style = MaterialTheme.typography.titleLarge, color = s.online)
                    Text("The kitchen team has been alerted with your location. Stay somewhere safe. They will contact you.")
                }
            } else Text("Press and hold a button to alert the kitchen team with your location. Nothing is sent by a single tap.", style = MaterialTheme.typography.bodyLarge)

            OutlinedTextField(message, { message = it.take(1000) }, label = { Text("Details (optional)") }, minLines = 2, modifier = Modifier.fillMaxWidth())
            HoldToConfirmButton("Emergency", s.danger, { vm.send("emergency", message, orderId) }, icon = Icons.Filled.Emergency)
            HoldToConfirmButton("I had an accident", s.warning, { vm.send("accident", message, orderId) }, icon = Icons.Filled.CarCrash)
            HoldToConfirmButton("I feel unsafe / threatened", s.info, { vm.send("safety", message, orderId) }, icon = Icons.Filled.Report)
            if (busy?.startsWith("sos:") == true) LinearProgressIndicator(Modifier.fillMaxWidth())

            SectionCard(title = "Call") {
                Text("Calls open your phone's dialer first; nothing is dialled automatically.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedButton(onClick = { Intents.dial(ctx, emergencyNumber) }, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = s.danger)) { Icon(Icons.Filled.LocalPhone, null); Spacer(Modifier.width(8.dp)); Text("EMERGENCY SERVICES ($emergencyNumber)") }
                if (supportPhone.isNotBlank()) OutlinedButton(onClick = { Intents.dial(ctx, supportPhone) }, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) {
                    Icon(Icons.Filled.SupportAgent, null); Spacer(Modifier.width(8.dp)); Text("KITCHEN SUPPORT")
                }
            }
        }
    }
}
