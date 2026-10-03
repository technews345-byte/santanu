package com.prabhat.app.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.VolumeDown
import androidx.compose.material.icons.automirrored.rounded.VolumeUp
import androidx.compose.material.icons.rounded.Alarm
import androidx.compose.material.icons.rounded.AutoStories
import androidx.compose.material.icons.rounded.Bedtime
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.LibraryMusic
import androidx.compose.material.icons.rounded.Repeat
import androidx.compose.material.icons.rounded.RepeatOne
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material.icons.rounded.SkipPrevious
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import com.prabhat.app.data.AppState
import com.prabhat.app.data.Store
import com.prabhat.app.domain.Format
import com.prabhat.app.domain.ScheduleMath
import com.prabhat.app.playback.PlaybackHub
import com.prabhat.app.playback.PlayerConnection
import com.prabhat.app.playback.SessionKind
import com.prabhat.app.ui.Routes
import com.prabhat.app.ui.components.BigPlayButton
import com.prabhat.app.ui.components.Eyebrow
import com.prabhat.app.ui.components.GlassCard
import com.prabhat.app.ui.components.MantraArt
import com.prabhat.app.ui.components.rememberNow
import com.prabhat.app.ui.morningMantra
import com.prabhat.app.ui.tab
import com.prabhat.app.ui.theme.LocalPalette
import java.time.LocalDate

@Composable
fun HomeScreen(state: AppState, player: PlayerConnection, pad: PaddingValues, nav: NavHostController) {
    val p = LocalPalette.current
    val ui by player.ui.collectAsStateWithLifecycle()
    val session by PlaybackHub.session.collectAsStateWithLifecycle()
    val sleep by PlaybackHub.sleep.collectAsStateWithLifecycle()
    val now by rememberNow(10_000)
    var sheet by remember { mutableStateOf<String?>(null) }
    var editTime by remember { mutableStateOf(false) }

    val next = if (state.scheduleOn) ScheduleMath.next(state.schedules, now) else null
    val home = morningMantra(state, now)
    val mantra = (if (ui.loaded) state.mantra(ui.mantraId) else null) ?: home
    val (greeting, subtitle) = Format.greeting(now.hour)
    val doneToday = state.completedOn == LocalDate.now().toString()
    val missed = if (state.scheduleOn && !doneToday && !ui.isPlaying) ScheduleMath.lastToday(state.schedules, now) else null

    fun start(id: String?, kind: SessionKind, resume: Boolean, fade: Boolean) =
        player.send(PlaybackHub.Command.Start(id, kind, resume, fade))

    fun skip(delta: Int) {
        if (ui.loaded) return player.send(PlaybackHub.Command.Skip(delta))
        val list = state.mantras
        if (list.isEmpty()) return
        val i = list.indexOfFirst { it.id == mantra?.id }.coerceAtLeast(0)
        start(list[Math.floorMod(i + delta, list.size)].id, SessionKind.MANUAL, resume = false, fade = false)
    }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .statusBarsPadding()
            .padding(bottom = pad.calculateBottomPadding())
            .padding(horizontal = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(20.dp))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f)) {
                Text(greeting, style = MaterialTheme.typography.headlineMedium)
                Text(subtitle, style = MaterialTheme.typography.bodyLarge, color = p.muted)
            }
            Text(Format.time(now.toLocalTime()), style = MaterialTheme.typography.titleMedium, color = p.muted, modifier = Modifier.padding(top = 8.dp))
        }

        AnimatedVisibility(missed != null && !ui.loaded) {
            GlassCard(Modifier.fillMaxWidth().padding(top = 16.dp)) {
                Text("Good morning 🌅", style = MaterialTheme.typography.titleLarge)
                Text(
                    "Your mantra was scheduled for ${missed?.let { Format.time(it.at.toLocalTime()) } ?: ""}.",
                    style = MaterialTheme.typography.bodyMedium, color = p.muted,
                )
                Spacer(Modifier.height(12.dp))
                Button(
                    onClick = { start(state.mantraFor(missed?.rule)?.id, SessionKind.MORNING, resume = false, fade = true) },
                    colors = ButtonDefaults.buttonColors(containerColor = p.gold),
                ) { Text("Play Now") }
            }
        }

        Spacer(Modifier.height(12.dp))
        MantraArt(mantra, 220.dp, playing = ui.isPlaying)

        Text(
            mantra?.name ?: "No mantra yet",
            style = MaterialTheme.typography.headlineSmall, textAlign = TextAlign.Center,
        )
        val detail = when {
            ui.loaded -> session?.playLabel ?: if (session?.kind == SessionKind.MANUAL) "Listening" else "Today's session"
            doneToday -> "Today's session complete ✓"
            else -> "Today's session"
        }
        Text(detail, style = MaterialTheme.typography.bodyMedium, color = p.muted)
        if (sleep != null) {
            Text(
                if (sleep?.endOfMantra == true) "🌙 Sleep timer: end of mantra" else "🌙 Sleep timer on",
                style = MaterialTheme.typography.bodySmall, color = p.gold,
            )
        }
        if (mantra != null && hasText(mantra)) {
            TextButton(onClick = { sheet = "lyrics" }) {
                Icon(Icons.Rounded.AutoStories, null, Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp))
                Text("View mantra")
            }
        }

        // Progress
        val duration = if (ui.loaded) ui.durationMs else mantra?.durationMs ?: 0L
        var dragging by remember { mutableStateOf(false) }
        var dragValue by remember { mutableFloatStateOf(0f) }
        val progress = if (duration > 0) (ui.positionMs.toFloat() / duration).coerceIn(0f, 1f) else 0f
        Slider(
            value = if (dragging) dragValue else if (ui.loaded) progress else 0f,
            onValueChange = { dragging = true; dragValue = it },
            onValueChangeFinished = { dragging = false; if (ui.loaded) player.seekTo((dragValue * duration).toLong()) },
            enabled = ui.loaded,
            colors = SliderDefaults.colors(thumbColor = p.gold, activeTrackColor = p.gold, inactiveTrackColor = p.gold.copy(alpha = 0.2f)),
            modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
        )
        Row(Modifier.fillMaxWidth()) {
            Text(Format.duration(if (dragging) (dragValue * duration).toLong() else if (ui.loaded) ui.positionMs else 0L), style = MaterialTheme.typography.labelMedium, color = p.muted)
            Spacer(Modifier.weight(1f))
            Text(Format.duration(duration), style = MaterialTheme.typography.labelMedium, color = p.muted)
        }

        // Controls
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(vertical = 8.dp)) {
            IconButton(onClick = { sheet = "repeat" }, modifier = Modifier.size(48.dp)) {
                Icon(if (state.repeat == 1) Icons.Rounded.RepeatOne else Icons.Rounded.Repeat, "Repeat: ${Format.repeat(state.repeat)}", tint = p.muted)
            }
            IconButton(onClick = { skip(-1) }, modifier = Modifier.size(56.dp)) {
                Icon(Icons.Rounded.SkipPrevious, "Previous", Modifier.size(34.dp))
            }
            BigPlayButton(ui.isPlaying) {
                when {
                    ui.isPlaying -> player.pause()
                    ui.loaded -> player.play()
                    else -> start(home?.id, SessionKind.MORNING, resume = true, fade = false)
                }
            }
            IconButton(onClick = { skip(1) }, modifier = Modifier.size(56.dp)) {
                Icon(Icons.Rounded.SkipNext, "Next", Modifier.size(34.dp))
            }
            IconButton(onClick = { sheet = "sleep" }, modifier = Modifier.size(48.dp)) {
                Icon(Icons.Rounded.Bedtime, "Sleep timer", tint = if (sleep != null) p.gold else p.muted)
            }
        }
        Text("Repeat: ${Format.repeat(state.repeat)}", style = MaterialTheme.typography.labelMedium, color = p.muted)

        // Volume
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(top = 4.dp)) {
            Icon(Icons.AutoMirrored.Rounded.VolumeDown, null, tint = p.muted)
            Slider(
                value = state.volume,
                onValueChange = { v -> Store.update { it.copy(volume = v) } },
                colors = SliderDefaults.colors(thumbColor = p.gold, activeTrackColor = p.gold, inactiveTrackColor = p.gold.copy(alpha = 0.2f)),
                modifier = Modifier.weight(1f).padding(horizontal = 8.dp),
            )
            Icon(Icons.AutoMirrored.Rounded.VolumeUp, null, tint = p.muted)
        }

        Spacer(Modifier.height(12.dp))
        NextSessionCard(state, next, onEditTime = { editTime = true }, onOpen = { nav.tab(Routes.SCHEDULE) }, nowText = next?.let { "Starts in " + ScheduleMath.countdown(now, it.at) })

        Spacer(Modifier.height(16.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
            QuickAction(Icons.Rounded.Alarm, "Schedule") { nav.tab(Routes.SCHEDULE) }
            QuickAction(Icons.Rounded.Repeat, "Repeat") { sheet = "repeat" }
            QuickAction(Icons.Rounded.Bedtime, "Timer") { sheet = "sleep" }
            QuickAction(Icons.Rounded.LibraryMusic, "Library") { nav.tab(Routes.LIBRARY) }
        }
        Spacer(Modifier.height(24.dp))
    }

    when (sheet) {
        "repeat" -> RepeatSheet(state) { sheet = null }
        "sleep" -> SleepSheet(player) { sheet = null }
        "lyrics" -> mantra?.let { LyricsSheet(it) { sheet = null } }
    }
    if (editTime) ScheduleEditor(state, next?.rule ?: state.schedules.firstOrNull()) { editTime = false }
}

@Composable
private fun NextSessionCard(
    state: AppState,
    next: com.prabhat.app.domain.Occurrence?,
    onEditTime: () -> Unit,
    onOpen: () -> Unit,
    nowText: String?,
) {
    val p = LocalPalette.current
    val rule = next?.rule ?: state.schedules.firstOrNull()
    GlassCard(Modifier.fillMaxWidth(), onClick = onOpen) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Eyebrow("Next Morning Session")
                Spacer(Modifier.height(6.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "🌅 " + (rule?.let { Format.time(it.hour, it.minute) } ?: "Not set"),
                        style = MaterialTheme.typography.headlineMedium,
                    )
                    IconButton(onClick = onEditTime) { Icon(Icons.Rounded.Edit, "Change time", tint = p.gold) }
                }
                Text(rule?.let { ScheduleMath.daysLabel(it.days) } ?: "Add a morning time", style = MaterialTheme.typography.bodyMedium, color = p.muted)
                Text("Mantra: ${state.mantraFor(rule)?.name ?: "—"}", style = MaterialTheme.typography.bodyMedium, color = p.muted)
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Switch(
                    checked = state.scheduleOn,
                    onCheckedChange = { on -> Store.update { it.copy(scheduleOn = on) } },
                    colors = SwitchDefaults.colors(checkedTrackColor = p.gold),
                )
                Text(if (state.scheduleOn) "Scheduled" else "Off", style = MaterialTheme.typography.labelMedium, color = if (state.scheduleOn) p.gold else p.muted)
            }
        }
        if (state.scheduleOn && nowText != null) {
            Spacer(Modifier.height(10.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Rounded.CheckCircle, null, tint = p.gold, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp))
                Text(nowText, style = MaterialTheme.typography.labelLarge, color = p.gold)
            }
        }
    }
}

@Composable
private fun QuickAction(icon: ImageVector, label: String, onClick: () -> Unit) {
    val p = LocalPalette.current
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Surface(onClick = onClick, shape = CircleShape, color = p.glass, modifier = Modifier.size(58.dp), border = androidx.compose.foundation.BorderStroke(1.dp, p.glassBorder)) {
            Icon(icon, label, tint = p.gold, modifier = Modifier.padding(16.dp))
        }
        Spacer(Modifier.height(6.dp))
        Text(label, style = MaterialTheme.typography.labelMedium, color = p.muted)
    }
}
