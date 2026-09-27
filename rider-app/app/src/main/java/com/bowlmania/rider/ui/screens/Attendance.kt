@file:OptIn(ExperimentalMaterial3Api::class)

package com.bowlmania.rider.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.EventNote
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.bowlmania.rider.AppContainer
import com.bowlmania.rider.data.net.AttendanceDay
import com.bowlmania.rider.data.net.AttendanceToday
import com.bowlmania.rider.data.net.Leave
import com.bowlmania.rider.domain.Times
import com.bowlmania.rider.location.LocationProblem
import com.bowlmania.rider.location.Locations
import com.bowlmania.rider.ui.*
import com.bowlmania.rider.ui.components.*
import com.bowlmania.rider.ui.theme.LocalStatus
import com.bowlmania.rider.ui.theme.Numeric
import kotlinx.coroutines.delay
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

class AttendanceVm(c: AppContainer) : LoadVm<AttendanceToday>(c) {
    override suspend fun fetch() = c.repository.attendance()

    fun checkIn(selfie: ByteArray) = act("checkin", {
        val loc = Locations.current(c.app) ?: return@act Result.failure<AttendanceToday>(IllegalStateException(LocationProblem.NO_FIX.message))
        c.repository.checkIn(selfie, loc.latitude, loc.longitude, if (loc.hasAccuracy()) loc.accuracy else null)
    }) { setData(it); Snack.show("Checked in at ${Times.clock(it.attendance?.checkInAt)}") }

    fun checkOut(selfie: ByteArray?) = act("checkout", {
        val loc = Locations.current(c.app, 6_000)
        c.repository.checkOut(selfie, loc?.latitude, loc?.longitude)
    }) { setData(it); Snack.show("Checked out. See you next shift!") }

    fun startBreak() = act("break", { c.repository.startBreak() }) { setData(it); Snack.show("Break started") }
    fun endBreak() = act("break", { c.repository.endBreak() }) { setData(it); Snack.show("Welcome back") }
}

@Composable
fun AttendanceScreen(nav: Nav) {
    val c = appContainer()
    val ctx = LocalContext.current
    val vm: AttendanceVm = viewModel { AttendanceVm(c) }
    val st by vm.state.collectAsState()
    val busy by vm.busy.collectAsState()
    var camera by remember { mutableStateOf<String?>(null) }   // "in" or "out"
    var confirmOut by remember { mutableStateOf(false) }
    val askLocation = rememberLocationPermission { granted -> if (granted) camera = "in" else Snack.show(LocationProblem.PERMISSION.message) }
    RefreshWhileVisible(60_000) { vm.load(silent = vm.state.value.data != null) }

    camera?.let { mode ->
        BackHandler { camera = null }
        CameraCapture(front = true, title = if (mode == "in") "Check-in selfie" else "Check-out selfie", hint = "Keep your face inside the circle in good light.",
            onCaptured = { bytes -> camera = null; if (mode == "in") vm.checkIn(bytes) else vm.checkOut(bytes) }, onClose = { camera = null })
        return
    }

    fun startCheckIn() {
        when (Locations.problem(ctx)) {
            LocationProblem.PERMISSION -> askLocation()
            LocationProblem.GPS_OFF -> { Snack.show(LocationProblem.GPS_OFF.message); Intents.locationSettings(ctx) }
            else -> camera = "in"
        }
    }

    Column(Modifier.fillMaxSize()) {
        AppBar("Attendance", actions = {
            IconButton(onClick = { nav.open("attendance/history") }) { Icon(Icons.Filled.History, "Attendance history") }
            IconButton(onClick = { nav.open("leave") }) { Icon(Icons.AutoMirrored.Filled.EventNote, "Leave requests") }
        })
        CachedNotice(st.cachedAt)
        val a = st.data
        when {
            a == null && st.loading -> Skeleton(4)
            a == null -> ErrorState(st.error ?: GENERIC_ERROR, { vm.load() })
            else -> PullToRefreshBox(isRefreshing = st.loading, onRefresh = { vm.load() }, modifier = Modifier.fillMaxSize()) {
                LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.fillMaxSize()) {
                    item { TodayCard(a) }
                    item {
                        when {
                            a.onLeave != null -> Text("You're on approved leave today.", style = MaterialTheme.typography.bodyLarge)
                            a.state == "not_checked_in" -> BigButton("Check in with selfie", onClick = ::startCheckIn, loading = busy == "checkin", icon = Icons.Filled.CameraFront)
                            a.state == "working" -> Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                OutlinedButton(onClick = vm::startBreak, enabled = busy == null, modifier = Modifier.fillMaxWidth().heightIn(min = 54.dp)) {
                                    if (busy == "break") CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp) else { Icon(Icons.Filled.FreeBreakfast, null); Spacer(Modifier.width(8.dp)); Text("START BREAK") }
                                }
                                BigButton("Check out", onClick = { confirmOut = true }, loading = busy == "checkout", enabled = busy == null, icon = Icons.AutoMirrored.Filled.Logout,
                                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.secondary))
                            }
                            a.state == "on_break" -> BigButton("End break", onClick = vm::endBreak, loading = busy == "break", icon = Icons.Filled.PlayArrow)
                            else -> Text("You've checked out for today.", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    if (a.breaks.isNotEmpty()) item {
                        SectionCard(title = "Breaks today") {
                            a.breaks.forEach { b ->
                                Row {
                                    Text("${Times.clock(b.startedAt)} – ${b.endedAt?.let(Times::clock) ?: "now"}", Modifier.weight(1f))
                                    val secs = Duration.between(Times.parse(b.startedAt) ?: Instant.now(), Times.parse(b.endedAt) ?: Instant.now()).seconds
                                    Text(Times.duration(secs.coerceAtLeast(0)), color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    }
                    item {
                        SectionCard(title = "Upcoming shifts") {
                            if (a.upcomingShifts.isEmpty()) Text("No upcoming shifts scheduled.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                            a.upcomingShifts.take(7).forEach { s ->
                                Row {
                                    Text(Times.dayLabel(s.date), Modifier.weight(1f), fontWeight = FontWeight.SemiBold)
                                    Text("${Times.hhmm(s.startTime)} – ${Times.hhmm(s.endTime)}")
                                }
                                if (s.note.isNotBlank()) Text(s.note, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                    item { Spacer(Modifier.height(16.dp)) }
                }
            }
        }
    }
    if (confirmOut) ConfirmDialog("Check out?", "You'll go offline and stop receiving deliveries for today.", "Check out",
        onConfirm = { confirmOut = false; if (st.data?.rules?.selfieOnCheckOut == true) camera = "out" else vm.checkOut(null) }, onDismiss = { confirmOut = false })
}

@Composable
private fun TodayCard(a: AttendanceToday) {
    val s = LocalStatus.current
    var now by remember { mutableStateOf(Instant.now()) }
    LaunchedEffect(a.state) { while (a.state == "working" || a.state == "on_break") { now = Instant.now(); delay(1_000) } }
    val (label, color) = when {
        a.onLeave != null -> "On leave" to s.info
        a.state == "working" -> "Working" to s.online
        a.state == "on_break" -> "On break" to s.warning
        a.state == "checked_out" -> "Checked out" to s.offline
        else -> "Not checked in" to s.warning
    }
    SectionCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(Times.dayLabel(a.date), style = MaterialTheme.typography.titleLarge)
                Text(a.shift?.let { "Shift ${Times.hhmm(it.startTime)} – ${Times.hhmm(it.endTime)}" } ?: "No shift scheduled",
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            StatusChip(label, color)
        }
        val rec = a.attendance
        if (rec != null) {
            val start = Times.parse(rec.checkInAt)
            val end = Times.parse(rec.checkOutAt) ?: now
            val breakSecs = a.breaks.sumOf { b -> Duration.between(Times.parse(b.startedAt) ?: now, Times.parse(b.endedAt) ?: now).seconds.coerceAtLeast(0) }
            val worked = if (start != null) (Duration.between(start, end).seconds - breakSecs).coerceAtLeast(0) else 0L
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Column(Modifier.weight(1f)) { Text(Times.duration(worked), style = Numeric); Text("Worked", style = MaterialTheme.typography.labelMedium) }
                Column(Modifier.weight(1f)) { Text(Times.duration(breakSecs), style = Numeric); Text("Breaks", style = MaterialTheme.typography.labelMedium) }
            }
            Text("In ${Times.clock(rec.checkInAt)}${rec.checkOutAt?.let { " · Out ${Times.clock(it)}" } ?: ""}${if (rec.status == "late") " · Late" else ""}",
                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

// ---------- History ----------
@Composable
fun AttendanceHistoryScreen(nav: Nav) {
    val c = appContainer()
    val vm: SimpleVm<List<AttendanceDay>> = viewModel { SimpleVm(c) { repository.attendanceHistory() } }
    val st by vm.state.collectAsState()
    LaunchedEffect(Unit) { vm.load() }
    Column(Modifier.fillMaxSize()) {
        AppBar("Attendance history", onBack = nav::back)
        CachedNotice(st.cachedAt)
        val list = st.data
        when {
            list == null && st.loading -> Skeleton(5)
            list == null -> ErrorState(st.error ?: GENERIC_ERROR, { vm.load() })
            list.isEmpty() -> EmptyState(Icons.Filled.EventAvailable, "No attendance yet", "Your check-ins will appear here.")
            else -> LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                items(list, key = { it.id }) { d ->
                    SectionCard {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(Times.dayLabel(d.date), style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                            StatusChip(d.status.replace('_', ' ').replaceFirstChar { it.uppercase() }, statusColor(d.status))
                        }
                        Text("In ${Times.clock(d.checkInAt)} · Out ${d.checkOutAt?.let(Times::clock) ?: "—"}")
                        Text(listOfNotNull(d.workedSeconds?.let { "Worked ${Times.duration(it)}" }, "Breaks ${Times.duration(d.breakSeconds)}",
                            d.shift?.let { "Shift ${Times.hhmm(it.startTime)}–${Times.hhmm(it.endTime)}" }).joinToString(" · "),
                            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

// ---------- Leave ----------
class LeaveVm(c: AppContainer) : LoadVm<List<Leave>>(c) {
    override suspend fun fetch() = c.repository.leave()
    fun request(from: String, to: String, reason: String, onOk: () -> Unit) = act("request", { c.repository.requestLeave(from, to, reason) }) {
        Snack.show("Leave request sent to your manager"); load(true); onOk()
    }
    fun cancel(id: Int) = act("cancel:$id", { c.repository.cancelLeave(id) }) { Snack.show("Leave request cancelled"); load(true) }
}

@Composable
fun LeaveScreen(nav: Nav) {
    val c = appContainer()
    val vm: LeaveVm = viewModel { LeaveVm(c) }
    val st by vm.state.collectAsState()
    val busy by vm.busy.collectAsState()
    var form by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { vm.load() }
    Scaffold(
        topBar = { AppBar("Leave", onBack = nav::back) },
        floatingActionButton = { ExtendedFloatingActionButton(onClick = { form = true }, icon = { Icon(Icons.Filled.Add, null) }, text = { Text("Request leave") }) },
        containerColor = MaterialTheme.colorScheme.background,
    ) { pad ->
        val list = st.data
        Box(Modifier.padding(pad).fillMaxSize()) {
            when {
                list == null && st.loading -> Skeleton(3)
                list == null -> ErrorState(st.error ?: GENERIC_ERROR, { vm.load() })
                list.isEmpty() -> EmptyState(Icons.AutoMirrored.Filled.EventNote, "No leave requests", "Request time off here. Your manager will approve or decline it.")
                else -> LazyColumn(contentPadding = PaddingValues(16.dp, 16.dp, 16.dp, 96.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(list, key = { it.id }) { l ->
                        SectionCard {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(if (l.fromDate == l.toDate) Times.date(l.fromDate) else "${Times.date(l.fromDate)} – ${Times.date(l.toDate)}",
                                    style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                                StatusChip(l.status.replaceFirstChar { it.uppercase() }, statusColor(l.status))
                            }
                            if (l.reason.isNotBlank()) Text(l.reason, style = MaterialTheme.typography.bodyMedium)
                            if (l.status == "pending") TextButton(onClick = { vm.cancel(l.id) }, enabled = busy == null) { Text("Cancel request") }
                        }
                    }
                }
            }
        }
    }
    if (form) LeaveForm(busy == "request", onSubmit = { f, t, r -> vm.request(f, t, r) { form = false } }, onDismiss = { form = false })
}

@Composable
private fun LeaveForm(loading: Boolean, onSubmit: (String, String, String) -> Unit, onDismiss: () -> Unit) {
    val today = LocalDate.now()
    var from by remember { mutableStateOf(today.plusDays(1)) }
    var to by remember { mutableStateOf(today.plusDays(1)) }
    var reason by remember { mutableStateOf("") }
    var picking by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = { if (!loading) onDismiss() },
        title = { Text("Request leave") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(onClick = { picking = "from" }, modifier = Modifier.fillMaxWidth()) { Text("From: ${Times.date(from.toString())}") }
                OutlinedButton(onClick = { picking = "to" }, modifier = Modifier.fillMaxWidth()) { Text("To: ${Times.date(to.toString())}") }
                OutlinedTextField(reason, { reason = it.take(500) }, label = { Text("Reason") }, minLines = 2, modifier = Modifier.fillMaxWidth())
                if (to.isBefore(from)) Text("The end date must be on or after the start date.", color = MaterialTheme.colorScheme.error)
            }
        },
        confirmButton = {
            Button(onClick = { onSubmit(from.toString(), to.toString(), reason.trim()) }, enabled = !loading && reason.isNotBlank() && !to.isBefore(from)) {
                if (loading) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp) else Text("Send")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !loading) { Text("Cancel") } },
    )
    picking?.let { which ->
        val initial = if (which == "from") from else to
        val state = rememberDatePickerState(
            initialSelectedDateMillis = initial.atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli(),
            selectableDates = object : SelectableDates {
                override fun isSelectableDate(utcTimeMillis: Long) = !Instant.ofEpochMilli(utcTimeMillis).atZone(ZoneOffset.UTC).toLocalDate().isBefore(today)
            },
        )
        DatePickerDialog(
            onDismissRequest = { picking = null },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { ms ->
                        val d = Instant.ofEpochMilli(ms).atZone(ZoneOffset.UTC).toLocalDate()
                        if (which == "from") { from = d; if (to.isBefore(d)) to = d } else to = d
                    }
                    picking = null
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { picking = null }) { Text("Cancel") } },
        ) { DatePicker(state) }
    }
}
