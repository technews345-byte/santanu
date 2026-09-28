@file:OptIn(ExperimentalMaterial3Api::class)

package com.bowlmania.rider.ui.screens

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.bowlmania.rider.AppContainer
import com.bowlmania.rider.data.net.Delivery
import com.bowlmania.rider.data.net.Home
import com.bowlmania.rider.domain.Times
import com.bowlmania.rider.location.LocationProblem
import com.bowlmania.rider.location.Locations
import com.bowlmania.rider.location.TrackingService
import com.bowlmania.rider.ui.*
import com.bowlmania.rider.ui.components.*
import com.bowlmania.rider.ui.theme.LocalStatus
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.update

class HomeVm(c: AppContainer) : LoadVm<Home>(c) {
    override suspend fun fetch() = c.repository.home()

    /** Keeps the tracking service in step with what the server says. */
    fun syncTracking(h: Home) {
        if (h.online || h.active != null) TrackingService.start(c.app, h.active?.orderId)
    }

    fun setOnline(online: Boolean) = act("status", { c.repository.setOnline(online) }) { s ->
        _state.update { st -> st.copy(data = st.data?.copy(online = s.online, onlineSince = s.onlineSince)) }
        val active = state.value.data?.active
        if (s.online) TrackingService.start(c.app, active?.orderId) else if (active == null) TrackingService.stop(c.app)
        Snack.show(if (s.online) "You're online. New deliveries will reach you." else "You're offline.")
        load(true)
    }
}

@Composable
fun HomeScreen(nav: Nav, online: Boolean) {
    val c = appContainer()
    val ctx = LocalContext.current
    val vm: HomeVm = viewModel { HomeVm(c) }
    val st by vm.state.collectAsState()
    val busy by vm.busy.collectAsState()
    val profile by c.session.profile.collectAsState()
    var problem by remember { mutableStateOf(Locations.problem(ctx)) }
    var rejecting by remember { mutableStateOf<Delivery?>(null) }
    var confirmOffline by remember { mutableStateOf(false) }
    val askLocation = rememberLocationPermission { granted -> problem = Locations.problem(ctx); if (granted && problem == null) vm.setOnline(true) }
    val askNotifications = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }

    RefreshWhileVisible(30_000) { vm.load(silent = vm.state.value.data != null); problem = Locations.problem(ctx) }
    LaunchedEffect(st.data?.online, st.data?.active?.orderId) { st.data?.let(vm::syncTracking) }

    fun goOnline() {
        problem = Locations.problem(ctx)
        when (problem) {
            LocationProblem.PERMISSION -> askLocation()
            LocationProblem.GPS_OFF -> { Snack.show(LocationProblem.GPS_OFF.message); Intents.locationSettings(ctx) }
            else -> {
                if (Build.VERSION.SDK_INT >= 33 && !c.prefs.askedNotificationPermission) {
                    c.prefs.askedNotificationPermission = true
                    askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
                }
                vm.setOnline(true)
            }
        }
    }

    Column(Modifier.fillMaxSize()) {
        AppBar("Home", actions = {
            IconButton(onClick = { nav.open("safety") }) { Icon(Icons.Filled.Shield, "Safety and emergency", tint = LocalStatus.current.danger) }
        })
        CachedNotice(st.cachedAt)
        val h = st.data
        when {
            h == null && st.loading -> Skeleton(5)
            h == null -> ErrorState(st.error ?: GENERIC_ERROR, { vm.load() })
            else -> PullToRefreshBox(isRefreshing = st.loading, onRefresh = { vm.load() }, modifier = Modifier.fillMaxSize()) {
                LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.fillMaxSize()) {
                    item {
                        val hour = Times.hour()
                        val greet = when { hour < 12 -> "Good morning"; hour < 17 -> "Good afternoon"; else -> "Good evening" }
                        Text("$greet, ${profile?.name?.substringBefore(' ') ?: h.rider.name}", style = MaterialTheme.typography.headlineSmall)
                        Text(Times.date(java.time.Instant.now().toString()), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    item {
                        OnlineCard(h, busy == "status", online) { want ->
                            if (want) goOnline() else if (h.active != null) Snack.show("Finish your active delivery before going offline.") else confirmOffline = true
                        }
                    }
                    if (problem != null && (h.online || h.active != null)) item { LocationWarning(problem!!, onFix = { if (problem == LocationProblem.PERMISSION) askLocation() else Intents.locationSettings(ctx) }) }
                    item { AttendanceStrip(h, onOpen = { nav.tab(MainTab.Attendance) }) }
                    h.active?.let { a ->
                        item { SectionTitle("Active delivery") }
                        item { DeliveryCard(a, onOpen = { nav.open("order/${a.orderId}") }, busy = busy) }
                        if (h.activeCount > 1) item {
                            TextButton(onClick = { nav.tab(MainTab.Orders) }) { Text("${h.activeCount - 1} more active in Orders") }
                        }
                    }
                    if (h.newAssignments.isNotEmpty()) {
                        item { SectionTitle("New deliveries for you") }
                        items(h.newAssignments, key = { "new${it.orderId}" }) { d ->
                            DeliveryCard(d, onOpen = { nav.open("order/${d.orderId}") }, busy = busy,
                                onAccept = { vm.accept(d.orderId) { nav.open("order/${it.orderId}") } }, onReject = { rejecting = d })
                        }
                    } else if (h.active == null) item {
                        EmptyState(Icons.Filled.DeliveryDining, if (h.online) "Waiting for deliveries" else "You're offline",
                            if (h.online) "Stay near the restaurant. New deliveries appear here and as a notification." else "Go online to start receiving deliveries.")
                    }
                    item { SectionTitle("Today") }
                    item {
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            MetricTile("Deliveries", h.today.deliveries.toString(), Modifier.weight(1f))
                            MetricTile("Completed", h.today.completed.toString(), Modifier.weight(1f), LocalStatus.current.online)
                        }
                    }
                    item {
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            MetricTile("Pending", h.today.pending.toString(), Modifier.weight(1f), LocalStatus.current.warning)
                            MetricTile("Distance", "%.1f km".format(h.today.distanceKm), Modifier.weight(1f))
                        }
                    }
                    item { SectionTitle("Quick actions") }
                    item {
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            QuickAction(Icons.Filled.History, "History", Modifier.weight(1f)) { nav.open("history") }
                            QuickAction(Icons.Filled.Insights, "Performance", Modifier.weight(1f)) { nav.open("performance") }
                            QuickAction(Icons.Filled.SupportAgent, "Support", Modifier.weight(1f)) { nav.open("support") }
                        }
                    }
                    item { Spacer(Modifier.height(24.dp)) }
                }
            }
        }
    }

    rejecting?.let { d ->
        RejectDialog(d.orderNumber, onReject = { reason -> rejecting = null; vm.reject(d.orderId, reason) }, onDismiss = { rejecting = null })
    }
    if (confirmOffline) ConfirmDialog("Go offline?", "You won't receive new deliveries until you go online again.", "Go offline",
        onConfirm = { confirmOffline = false; vm.setOnline(false) }, onDismiss = { confirmOffline = false })
}

@Composable
private fun OnlineCard(h: Home, busy: Boolean, connected: Boolean, onToggle: (Boolean) -> Unit) {
    val s = LocalStatus.current
    val color = if (h.online) s.online else s.offline
    Surface(shape = MaterialTheme.shapes.large, color = color.copy(alpha = 0.12f), modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(14.dp).clip(CircleShape).background(color))
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(if (h.online) "You're online" else "You're offline", style = MaterialTheme.typography.titleLarge, color = color, fontWeight = FontWeight.Bold)
                Text(
                    when {
                        h.online && h.onlineSince != null -> "Since ${Times.clock(h.onlineSince)} · sharing location"
                        h.online -> "Sharing location"
                        else -> "Go online to receive deliveries"
                    },
                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (busy) CircularProgressIndicator(Modifier.size(28.dp), strokeWidth = 3.dp)
            else Switch(
                checked = h.online, onCheckedChange = onToggle, enabled = connected,
                modifier = Modifier.semantics { contentDescription = "Online status"; stateDescription = if (h.online) "Online" else "Offline" },
                colors = SwitchDefaults.colors(checkedTrackColor = s.online),
            )
        }
    }
}

@Composable
private fun LocationWarning(problem: LocationProblem, onFix: () -> Unit) {
    val s = LocalStatus.current
    Surface(shape = MaterialTheme.shapes.medium, color = s.danger.copy(alpha = 0.12f), modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Icon(Icons.Filled.LocationOff, null, tint = s.danger)
            Text(problem.message, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
            TextButton(onClick = onFix) { Text("FIX") }
        }
    }
}

@Composable
private fun AttendanceStrip(h: Home, onOpen: () -> Unit) {
    val a = h.attendance
    val (label, color) = when {
        a.onLeave -> "On leave today" to LocalStatus.current.info
        a.state == "working" -> "Checked in" to LocalStatus.current.online
        a.state == "on_break" -> "On break" to LocalStatus.current.warning
        a.state == "checked_out" -> "Checked out" to LocalStatus.current.offline
        else -> "Not checked in" to LocalStatus.current.warning
    }
    SectionCard(Modifier.clickable(onClickLabel = "Open attendance", onClick = onOpen)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.EventAvailable, null, tint = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text("Attendance", style = MaterialTheme.typography.titleMedium)
                Text(if (a.state == "not_checked_in") "Check in with a selfie when you start work" else "Tap to see today's hours and breaks",
                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            StatusChip(label, color)
        }
    }
}

@Composable
fun SectionTitle(text: String) {
    Text(text, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 6.dp))
}

@Composable
private fun QuickAction(icon: ImageVector, label: String, modifier: Modifier, onClick: () -> Unit) {
    Surface(onClick = onClick, shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.surfaceContainer, modifier = modifier.heightIn(min = 84.dp)) {
        Column(Modifier.padding(12.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Icon(icon, null, tint = MaterialTheme.colorScheme.primary)
            Text(label, style = MaterialTheme.typography.labelLarge, color = Color.Unspecified)
        }
    }
}
