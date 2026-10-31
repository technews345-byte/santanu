package com.prabhat.app.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.WbSunny
import androidx.compose.material.icons.rounded.WbTwilight
import androidx.compose.material3.Button
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import com.prabhat.app.data.Anchor
import com.prabhat.app.data.AppState
import com.prabhat.app.data.Store
import com.prabhat.app.domain.Format
import com.prabhat.app.domain.Occurrence
import com.prabhat.app.domain.ScheduleMath
import com.prabhat.app.domain.Sun
import com.prabhat.app.playback.PlaybackHub
import com.prabhat.app.playback.PlayerConnection
import com.prabhat.app.playback.SessionKind
import com.prabhat.app.ui.Routes
import com.prabhat.app.ui.components.BigPlayButton
import com.prabhat.app.ui.components.Eyebrow
import com.prabhat.app.ui.components.GlassCard
import com.prabhat.app.ui.components.MantraArt
import com.prabhat.app.ui.components.rememberNow
import com.prabhat.app.ui.morningRule
import com.prabhat.app.ui.tab
import com.prabhat.app.ui.theme.LocalPalette
import java.time.ZonedDateTime

/** Dashboard: greeting with today's sun, what is playing (or a start button), the next session and today's routine. */
@Composable
fun HomeScreen(state: AppState, player: PlayerConnection, pad: PaddingValues, nav: NavHostController) {
    val p = LocalPalette.current
    val ui by player.ui.collectAsStateWithLifecycle()
    val session by PlaybackHub.session.collectAsStateWithLifecycle()
    val now by rememberNow(10_000)
    var editTime by remember { mutableStateOf(false) }

    val next = if (state.scheduleOn) ScheduleMath.next(state.schedules, now, state.place) else null
    val homeRule = next?.rule ?: morningRule(state, now)
    val home = state.mantraFor(homeRule)
    val (greeting, subtitle) = Format.greeting(now.hour)
    val sun = state.place?.let { Sun.times(now.toLocalDate(), it, now.zone) }
    val today = if (state.scheduleOn) ScheduleMath.today(state.schedules, now, state.place) else emptyList()
    val pending = if (state.scheduleOn) ScheduleMath.pendingToday(state.schedules, now, state.lastCompletedAt, state.place) else null

    fun play(occ: Occurrence?) {
        player.send(PlaybackHub.Command.Start(state.mantraFor(occ?.rule ?: homeRule)?.id, SessionKind.MORNING, resume = occ == null, fade = occ != null, (occ?.rule ?: homeRule)?.repeat))
        nav.navigate(Routes.PLAYER)
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).statusBarsPadding()
            .padding(bottom = pad.calculateBottomPadding() + 24.dp).padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Spacer(Modifier.height(10.dp))
        Row(verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f)) {
                Text(greeting, style = MaterialTheme.typography.headlineMedium)
                Text(subtitle, style = MaterialTheme.typography.bodyLarge, color = p.muted)
            }
            Text(Format.time(now.toLocalTime()), style = MaterialTheme.typography.titleMedium, color = p.muted, modifier = Modifier.padding(top = 8.dp))
        }
        sun?.let { (rise, set) ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Rounded.WbSunny, null, tint = p.gold, modifier = Modifier.size(16.dp))
                Text(" ${Format.time(rise.toLocalTime())}", style = MaterialTheme.typography.labelLarge)
                Spacer(Modifier.width(14.dp))
                Icon(Icons.Rounded.WbTwilight, null, tint = p.gold, modifier = Modifier.size(16.dp))
                Text(" ${Format.time(set.toLocalTime())}", style = MaterialTheme.typography.labelLarge)
                Text("  ·  ${state.place?.name}", style = MaterialTheme.typography.labelMedium, color = p.muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }

        AnimatedVisibility(pending != null && !ui.isPlaying) {
            GlassCard(Modifier.fillMaxWidth()) {
                Text("Your mantra was scheduled for ${pending?.let { Format.time(it.at.toLocalTime()) }}.", style = MaterialTheme.typography.titleMedium)
                Text(state.mantraFor(pending?.rule)?.name.orEmpty(), style = MaterialTheme.typography.bodyMedium, color = p.muted)
                Spacer(Modifier.height(10.dp))
                Button(onClick = { play(pending) }) { Text("Play Now") }
            }
        }

        if (ui.loaded) {
            val playing = state.mantra(ui.mantraId) ?: home
            GlassCard(Modifier.fillMaxWidth(), onClick = { nav.navigate(Routes.PLAYER) }, padding = PaddingValues(14.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(84.dp), contentAlignment = Alignment.Center) { MantraArt(playing, 64.dp, ui.isPlaying, glow = false) }
                    Column(Modifier.weight(1f).padding(horizontal = 8.dp)) {
                        Eyebrow(if (ui.isPlaying) "Now playing" else "Paused")
                        Text(playing?.name.orEmpty(), style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        session?.playLabel?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = p.muted) }
                    }
                    IconButton(onClick = { if (ui.isPlaying) player.pause() else player.play() }) {
                        Icon(if (ui.isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, if (ui.isPlaying) "Pause" else "Play", tint = p.gold, modifier = Modifier.size(34.dp))
                    }
                }
            }
        } else {
            GlassCard(Modifier.fillMaxWidth(), onClick = { nav.navigate(Routes.PLAYER) }) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(120.dp), contentAlignment = Alignment.Center) { MantraArt(home, 92.dp) }
                    Column(Modifier.weight(1f).padding(start = 8.dp)) {
                        Eyebrow("Begin your practice")
                        Text(home?.name ?: "Add a mantra", style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        Text(Format.repeat(state.repeatFor(homeRule)), style = MaterialTheme.typography.bodySmall, color = p.muted)
                    }
                    BigPlayButton(false, size = 60.dp) { play(null) }
                }
            }
        }

        NextSessionCard(state, next, now, onEditTime = { editTime = true }, onOpen = { nav.tab(Routes.SCHEDULE) })

        if (today.isNotEmpty()) {
            GlassCard(Modifier.fillMaxWidth().animateContentSize()) {
                Eyebrow("Today's routine")
                Spacer(Modifier.height(4.dp))
                today.forEach { occ -> RoutineRow(state, occ, now, onPlay = { play(occ) }) }
            }
        }
    }

    if (editTime) ScheduleEditor(state, next?.rule ?: state.schedules.firstOrNull()) { editTime = false }
}

/** One of today's sessions: done ✓, missed (with Play) or upcoming (with its countdown). */
@Composable
private fun RoutineRow(state: AppState, occ: Occurrence, now: ZonedDateTime, onPlay: () -> Unit) {
    val p = LocalPalette.current
    val past = !occ.at.isAfter(now)
    val done = past && state.lastCompletedAt >= occ.at.toInstant().toEpochMilli()
    Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.width(86.dp)) {
            Text(Format.time(occ.at.toLocalTime()), style = MaterialTheme.typography.titleSmall)
            if (occ.rule.anchor != Anchor.TIME) Text(ScheduleMath.label(occ.rule), style = MaterialTheme.typography.labelSmall, color = p.muted, maxLines = 1)
        }
        Column(Modifier.weight(1f)) {
            Text(state.mantraFor(occ.rule)?.name.orEmpty(), style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(Format.repeat(state.repeatFor(occ.rule)), style = MaterialTheme.typography.bodySmall, color = p.muted)
        }
        when {
            done -> Icon(Icons.Rounded.CheckCircle, "Done", tint = p.gold)
            past -> FilledTonalButton(onClick = onPlay, contentPadding = PaddingValues(horizontal = 14.dp)) { Text("Play") }
            else -> Text("in " + ScheduleMath.countdown(now, occ.at), style = MaterialTheme.typography.labelMedium, color = p.gold)
        }
    }
}

@Composable
private fun NextSessionCard(state: AppState, next: Occurrence?, now: ZonedDateTime, onEditTime: () -> Unit, onOpen: () -> Unit) {
    val p = LocalPalette.current
    val rule = next?.rule ?: state.schedules.firstOrNull()
    GlassCard(Modifier.fillMaxWidth(), onClick = onOpen) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Eyebrow("Next session")
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(next?.let { Format.time(it.at.toLocalTime()) } ?: rule?.let(ScheduleMath::label) ?: "Not set", style = MaterialTheme.typography.headlineMedium)
                    IconButton(onClick = onEditTime) { Icon(Icons.Rounded.Edit, "Change time", tint = p.gold) }
                }
                Text(
                    listOfNotNull(rule?.takeIf { it.anchor != Anchor.TIME }?.let(ScheduleMath::label), rule?.let { ScheduleMath.daysLabel(it.days) }).joinToString(" · "),
                    style = MaterialTheme.typography.bodyMedium, color = p.muted,
                )
                Text(state.mantraFor(rule)?.name ?: "—", style = MaterialTheme.typography.bodyMedium, color = p.muted)
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Switch(checked = state.scheduleOn, onCheckedChange = { on -> Store.update { it.copy(scheduleOn = on) } })
                Text(if (state.scheduleOn) "On" else "Off", style = MaterialTheme.typography.labelMedium, color = if (state.scheduleOn) p.gold else p.muted)
            }
        }
        if (next != null) {
            Spacer(Modifier.height(8.dp))
            Text("Starts in " + ScheduleMath.countdown(now, next.at), style = MaterialTheme.typography.labelLarge, color = p.gold)
        }
    }
}
