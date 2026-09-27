@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)

package com.bowlmania.rider.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import com.bowlmania.rider.AppContainer
import com.bowlmania.rider.BuildConfig
import com.bowlmania.rider.data.Prefs
import com.bowlmania.rider.data.net.HistoryRow
import com.bowlmania.rider.data.net.Performance
import com.bowlmania.rider.data.net.Profile
import com.bowlmania.rider.domain.Times
import com.bowlmania.rider.location.Locations
import com.bowlmania.rider.location.TrackingService
import com.bowlmania.rider.ui.*
import com.bowlmania.rider.ui.components.*
import com.bowlmania.rider.ui.theme.LocalStatus
import com.bowlmania.rider.work.Workers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import java.time.LocalDate

class ProfileVm(c: AppContainer) : LoadVm<Profile>(c) {
    override suspend fun fetch() = c.repository.refreshProfile().loaded()

    fun signOut(onDone: () -> Unit) = act("logout", {
        TrackingService.stop(c.app)
        Workers.cancelAll(c.app)
        c.repository.logout()
        Result.success(Unit)
    }) { onDone() }
}

@Composable
fun ProfileScreen(nav: Nav, onSignedOut: () -> Unit) {
    val c = appContainer()
    val vm: ProfileVm = viewModel { ProfileVm(c) }
    val cached by c.session.profile.collectAsState()
    val busy by vm.busy.collectAsState()
    var confirm by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { vm.load(silent = true) }
    val p = cached

    Column(Modifier.fillMaxSize()) {
        AppBar("Profile")
        Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            if (p == null) Skeleton(3) else {
                SectionCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Avatar(p, c)
                        Spacer(Modifier.width(16.dp))
                        Column(Modifier.weight(1f)) {
                            Text(p.name, style = MaterialTheme.typography.titleLarge)
                            Text(listOf(p.role.ifBlank { "Delivery partner" }, p.employeeId.takeIf { it.isNotBlank() }?.let { "ID $it" }).filterNotNull().joinToString(" · "),
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(p.company, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
                SectionCard(title = "Details") {
                    InfoRow(Icons.Filled.Phone, "Phone", p.phone)
                    InfoRow(Icons.Filled.Email, "Email", p.email)
                    InfoRow(Icons.Filled.TwoWheeler, "Vehicle", listOf(p.vehicleType, p.vehicleNumber).filter { it.isNotBlank() }.joinToString(" · "))
                    InfoRow(Icons.Filled.Badge, "Joined", p.joiningDate?.let(Times::date).orEmpty())
                    InfoRow(Icons.Filled.Schedule, "Today's shift", p.shiftToday?.let { "${Times.hhmm(it.startTime)} – ${Times.hhmm(it.endTime)}" } ?: "Not scheduled")
                    Text("To change these details, contact your manager.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            SectionCard {
                MenuRow(Icons.Filled.Insights, "Performance") { nav.open("performance") }
                MenuRow(Icons.Filled.History, "Delivery history") { nav.open("history") }
                MenuRow(Icons.Filled.SupportAgent, "Help & support") { nav.open("support") }
                MenuRow(Icons.Filled.Shield, "Safety & emergency") { nav.open("safety") }
                MenuRow(Icons.Filled.Settings, "Settings") { nav.open("settings") }
            }
            OutlinedButton(onClick = { confirm = true }, enabled = busy == null, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error)) {
                if (busy == "logout") CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                else { Icon(Icons.AutoMirrored.Filled.Logout, null); Spacer(Modifier.width(8.dp)); Text("SIGN OUT") }
            }
            Text("Bowl Mania Rider ${BuildConfig.VERSION_NAME}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.align(Alignment.CenterHorizontally))
        }
    }
    if (confirm) ConfirmDialog("Sign out?", "You'll go offline and stop receiving deliveries on this phone.", "Sign out",
        onConfirm = { confirm = false; vm.signOut(onSignedOut) }, onDismiss = { confirm = false }, destructive = true)
}

@Composable
private fun Avatar(p: Profile, c: AppContainer) {
    Box(Modifier.size(68.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer), contentAlignment = Alignment.Center) {
        Text(p.name.split(' ').filter { it.isNotBlank() }.take(2).joinToString("") { it.take(1).uppercase() },
            style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onPrimaryContainer)
        if (p.photoUrl != null) AsyncImage(
            model = BuildConfig.API_BASE_URL.trimEnd('/') + p.photoUrl, imageLoader = c.images, contentDescription = "Profile photo",
            contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize(),
        )
    }
}

@Composable
private fun InfoRow(icon: ImageVector, label: String, value: String) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.heightIn(min = 40.dp)) {
        Icon(icon, null, Modifier.size(20.dp), tint = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.width(14.dp))
        Text(label, Modifier.width(110.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value.ifBlank { "—" }, Modifier.weight(1f), fontWeight = FontWeight.Medium)
    }
}

@Composable
fun MenuRow(icon: ImageVector, label: String, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clip(MaterialTheme.shapes.small).clickable(onClick = onClick).heightIn(min = 52.dp).padding(horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.width(16.dp))
        Text(label, Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

// ---------- Performance (operational figures only) ----------
private enum class Range(val label: String) { TODAY("Today"), WEEK("7 days"), MONTH("This month"), DAYS30("30 days") }
private fun Range.bounds(): Pair<String, String> {
    val today = LocalDate.parse(Times.today())
    return when (this) {
        Range.TODAY -> today to today
        Range.WEEK -> today.minusDays(6) to today
        Range.MONTH -> today.withDayOfMonth(1) to today
        Range.DAYS30 -> today.minusDays(29) to today
    }.let { (a, b) -> a.toString() to b.toString() }
}

class PerformanceVm(c: AppContainer) : LoadVm<Performance>(c) {
    var from: String? = null; var to: String? = null
    override suspend fun fetch() = c.repository.performance(from, to)
    fun range(f: String, t: String) { from = f; to = t; setLoading(); load() }
    private fun setLoading() { _state.value = _state.value.copy(loading = true) }
}

@Composable
fun PerformanceScreen(nav: Nav) {
    val c = appContainer()
    val vm: PerformanceVm = viewModel { PerformanceVm(c) }
    val st by vm.state.collectAsState()
    var range by rememberSaveable { mutableStateOf(Range.WEEK) }
    LaunchedEffect(range) { val (f, t) = range.bounds(); vm.range(f, t) }
    val s = LocalStatus.current
    Column(Modifier.fillMaxSize()) {
        AppBar("Performance", onBack = nav::back)
        FlowRow(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Range.entries.forEach { r -> FilterChip(selected = range == r, onClick = { range = r }, label = { Text(r.label) }) }
        }
        CachedNotice(st.cachedAt)
        val p = st.data
        when {
            p == null && st.loading -> Skeleton(4)
            p == null -> ErrorState(st.error ?: GENERIC_ERROR, { vm.load() })
            else -> Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (st.loading) LinearProgressIndicator(Modifier.fillMaxWidth())
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    MetricTile("Total deliveries", p.totalDeliveries.toString(), Modifier.weight(1f))
                    MetricTile("Completed", p.completed.toString(), Modifier.weight(1f), s.online)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    MetricTile("Cancelled", p.cancelled.toString(), Modifier.weight(1f), s.danger)
                    MetricTile("Rejected", p.rejected.toString(), Modifier.weight(1f), s.warning)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    MetricTile("On time", p.onTimeRate?.let { "$it%" } ?: "—", Modifier.weight(1f), s.online)
                    MetricTile("Avg. delivery time", p.avgDeliveryMinutes?.let { "$it min" } ?: "—", Modifier.weight(1f))
                }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    MetricTile("Distance", "%.1f km".format(p.distanceKm), Modifier.weight(1f))
                    MetricTile(if (p.ratingsCount > 0) "Rating (${p.ratingsCount})" else "Rating", p.rating?.let { "%.1f ★".format(it) } ?: "—", Modifier.weight(1f), s.warning)
                }
                Text("${Times.date(p.from)} – ${Times.date(p.to)}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

// ---------- Delivery history ----------
class HistoryVm(private val c: AppContainer) : ViewModel() {
    val rows = MutableStateFlow<List<HistoryRow>>(emptyList())
    val loading = MutableStateFlow(false)
    val error = MutableStateFlow<String?>(null)
    val total = MutableStateFlow(0)
    private var page = 1
    var status = "all"; private set
    var range = "30"; private set

    fun reload(status: String = this.status, range: String = this.range) {
        this.status = status; this.range = range; page = 1; rows.value = emptyList(); more()
    }
    fun more() {
        if (loading.value) return
        viewModelScope.launch {
            loading.value = true; error.value = null
            val today = LocalDate.parse(Times.today())
            val from = when (range) { "today" -> today; "7" -> today.minusDays(6); "30" -> today.minusDays(29); else -> null }?.toString()
            c.repository.history(status, from, today.toString(), page).fold(
                { p -> rows.value = (rows.value + p.rows).distinctBy { "${it.orderId}-${it.status}" }; total.value = p.total; page++ },
                { error.value = it.message },
            )
            loading.value = false
        }
    }
}

@Composable
fun HistoryScreen(nav: Nav) {
    val c = appContainer()
    val vm: HistoryVm = viewModel { HistoryVm(c) }
    val rows by vm.rows.collectAsState()
    val loading by vm.loading.collectAsState()
    val error by vm.error.collectAsState()
    val total by vm.total.collectAsState()
    var status by rememberSaveable { mutableStateOf("all") }
    var range by rememberSaveable { mutableStateOf("30") }
    LaunchedEffect(status, range) { vm.reload(status, range) }

    Column(Modifier.fillMaxSize()) {
        AppBar("Delivery history", onBack = nav::back)
        FlowRow(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("all" to "All", "delivered" to "Delivered", "cancelled" to "Cancelled", "rejected" to "Rejected").forEach { (k, l) ->
                FilterChip(selected = status == k, onClick = { status = k }, label = { Text(l) })
            }
        }
        FlowRow(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("today" to "Today", "7" to "7 days", "30" to "30 days", "all" to "All time").forEach { (k, l) ->
                FilterChip(selected = range == k, onClick = { range = k }, label = { Text(l) })
            }
        }
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxSize()) {
            if (rows.isEmpty() && !loading && error == null) item { EmptyState(Icons.Filled.History, "No deliveries found", "Try a different filter.") }
            if (rows.isNotEmpty()) item { Text("$total deliveries", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            items(rows, key = { "${it.orderId}-${it.status}" }) { r ->
                SectionCard(Modifier.clickable(enabled = r.status == "delivered") { nav.open("order/${r.orderId}") }) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("#${r.orderNumber}", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                        StatusChip(r.status.replaceFirstChar { it.uppercase() }, statusColor(r.status))
                    }
                    Text("${Times.date(r.at)} · ${Times.clock(r.at)}${r.distanceKm?.let { " · %.1f km".format(it) } ?: ""}", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (!r.address.isNullOrBlank()) Text(r.address, style = MaterialTheme.typography.bodyMedium)
                }
            }
            item {
                Box(Modifier.fillMaxWidth().padding(8.dp), contentAlignment = Alignment.Center) {
                    when {
                        loading -> CircularProgressIndicator(Modifier.size(24.dp))
                        error != null -> ErrorState(error!!, vm::more)
                        rows.size < total -> TextButton(onClick = vm::more) { Text("Load more") }
                    }
                }
            }
        }
    }
}

// ---------- Settings ----------
@Composable
fun SettingsScreen(nav: Nav) {
    val c = appContainer()
    val ctx = LocalContext.current
    val theme by c.prefs.theme.collectAsState()
    val scope = rememberCoroutineScope()
    var queued by remember { mutableIntStateOf(0) }
    LaunchedEffect(Unit) { queued = c.repository.queuedLocations() }
    Column(Modifier.fillMaxSize()) {
        AppBar("Settings", onBack = nav::back)
        Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            SectionCard(title = "Appearance") {
                listOf(Prefs.THEME_SYSTEM to "Use phone setting", Prefs.THEME_LIGHT to "Light", Prefs.THEME_DARK to "Dark").forEach { (k, l) ->
                    Row(Modifier.fillMaxWidth().clickable { c.prefs.setTheme(k) }.heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(selected = theme == k, onClick = { c.prefs.setTheme(k) }); Text(l)
                    }
                }
            }
            SectionCard(title = "Permissions") {
                val problem = Locations.problem(ctx)
                Text(problem?.message ?: "Location is on and allowed.", color = if (problem == null) LocalStatus.current.online else LocalStatus.current.danger)
                MenuRow(Icons.Filled.LocationOn, "Location settings") { Intents.locationSettings(ctx) }
                MenuRow(Icons.Filled.Notifications, "Notification settings") { Intents.notificationSettings(ctx) }
                MenuRow(Icons.Filled.BatteryChargingFull, "Battery optimisation") { Intents.batterySettings(ctx) }
                Text("If deliveries arrive late, allow the app to run without battery restrictions.", style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                MenuRow(Icons.Filled.AppSettingsAlt, "All app permissions") { Intents.appSettings(ctx) }
            }
            SectionCard(title = "Data") {
                Text(if (queued > 0) "$queued location updates waiting to upload." else "All location updates are uploaded.")
                MenuRow(Icons.Filled.Sync, "Upload now") {
                    scope.launch {
                        c.repository.flushLocations().onFailure { Snack.show(it.message ?: GENERIC_ERROR) }
                        queued = c.repository.queuedLocations()
                    }
                }
            }
            SectionCard(title = "About") {
                InfoRow(Icons.Filled.Info, "Version", "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
                InfoRow(Icons.Filled.Cloud, "Server", BuildConfig.API_BASE_URL.removePrefix("https://").trimEnd('/'))
                if (BuildConfig.ENVIRONMENT != "production") InfoRow(Icons.Filled.Build, "Environment", BuildConfig.ENVIRONMENT)
            }
        }
    }
}
