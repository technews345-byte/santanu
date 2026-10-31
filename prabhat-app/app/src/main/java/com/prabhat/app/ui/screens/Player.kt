package com.prabhat.app.ui.screens

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.VolumeDown
import androidx.compose.material.icons.automirrored.rounded.VolumeUp
import androidx.compose.material.icons.rounded.Bedtime
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.Repeat
import androidx.compose.material.icons.rounded.RepeatOne
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material.icons.rounded.SkipPrevious
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import com.prabhat.app.data.AppState
import com.prabhat.app.data.Library
import com.prabhat.app.data.LyricLine
import com.prabhat.app.data.Mantra
import com.prabhat.app.data.Store
import com.prabhat.app.domain.Format
import com.prabhat.app.playback.PlaybackHub
import com.prabhat.app.playback.PlayerConnection
import com.prabhat.app.playback.PlayerUi
import com.prabhat.app.playback.SessionInfo
import com.prabhat.app.playback.SessionKind
import com.prabhat.app.ui.components.BigPlayButton
import com.prabhat.app.ui.components.Eyebrow
import com.prabhat.app.ui.components.GlassCard
import com.prabhat.app.ui.components.MantraArt
import com.prabhat.app.ui.morningRule
import com.prabhat.app.ui.theme.LocalPalette

/** Full-screen player: mandala and japa ring around the artwork, synced words, and the controls. */
@Composable
fun PlayerScreen(state: AppState, player: PlayerConnection, nav: NavHostController) {
    val p = LocalPalette.current
    val ui by player.ui.collectAsStateWithLifecycle()
    val session by PlaybackHub.session.collectAsStateWithLifecycle()
    val sleep by PlaybackHub.sleep.collectAsStateWithLifecycle()
    var sheet by remember { mutableStateOf<String?>(null) }
    val rule = morningRule(state)
    val mantra = (if (ui.loaded) state.mantra(ui.mantraId) else null) ?: state.mantraFor(rule)
    val lines = Library.lines(mantra)
    val repeat = session?.target ?: state.repeatFor(rule)

    fun skip(delta: Int) {
        if (ui.loaded) return player.send(PlaybackHub.Command.Skip(delta))
        val list = state.mantras
        if (list.isEmpty()) return
        val i = list.indexOfFirst { it.id == mantra?.id }.coerceAtLeast(0)
        player.send(PlaybackHub.Command.Start(list[Math.floorMod(i + delta, list.size)].id, SessionKind.MANUAL, resume = false, fade = false))
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).statusBarsPadding().navigationBarsPadding().padding(horizontal = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Row(Modifier.fillMaxWidth().padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.Rounded.KeyboardArrowDown, "Close player", Modifier.size(30.dp)) }
            Spacer(Modifier.weight(1f))
            Eyebrow(if (ui.loaded) "Now playing" else "Ready")
            Spacer(Modifier.weight(1f))
            IconButton(onClick = { sheet = "sleep" }) {
                Icon(Icons.Rounded.Bedtime, "Sleep timer", tint = if (sleep != null) p.gold else p.muted)
            }
        }

        ArtStage(mantra, ui, session, player)

        Text(mantra?.name ?: "No mantra yet", style = MaterialTheme.typography.headlineSmall, textAlign = TextAlign.Center)
        Text(japaLabel(session, repeat), style = MaterialTheme.typography.bodyMedium, color = p.gold)
        if (sleep != null) {
            Text(
                if (sleep?.endOfMantra == true) "Sleep timer: end of mantra" else "Sleep timer on",
                style = MaterialTheme.typography.bodySmall, color = p.muted,
            )
        }

        Spacer(Modifier.height(14.dp))
        when {
            lines.isNotEmpty() -> SyncedLyrics(lines, active = ui.loaded && ui.mantraId == mantra?.id, player)
            mantra != null && hasText(mantra) -> GlassCard(Modifier.fillMaxWidth()) { Lyrics(mantra) }
        }

        ProgressBar(player, ui, if (ui.loaded) ui.durationMs else mantra?.durationMs ?: 0L)

        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(vertical = 8.dp)) {
            IconButton(onClick = { sheet = "repeat" }, modifier = Modifier.size(48.dp)) {
                Icon(if (repeat == 1) Icons.Rounded.RepeatOne else Icons.Rounded.Repeat, "Japa count: ${Format.repeat(repeat)}", tint = p.muted)
            }
            IconButton(onClick = { skip(-1) }, modifier = Modifier.size(56.dp)) { Icon(Icons.Rounded.SkipPrevious, "Previous", Modifier.size(34.dp)) }
            BigPlayButton(ui.isPlaying) {
                when {
                    ui.isPlaying -> player.pause()
                    ui.loaded -> player.play()
                    else -> player.send(PlaybackHub.Command.Start(mantra?.id, SessionKind.MORNING, resume = true, fade = false, rule?.repeat))
                }
            }
            IconButton(onClick = { skip(1) }, modifier = Modifier.size(56.dp)) { Icon(Icons.Rounded.SkipNext, "Next", Modifier.size(34.dp)) }
            Spacer(Modifier.size(48.dp))
        }

        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)) {
            Icon(Icons.AutoMirrored.Rounded.VolumeDown, null, tint = p.muted)
            Slider(value = state.volume, onValueChange = { v -> Store.update { it.copy(volume = v) } }, modifier = Modifier.weight(1f).padding(horizontal = 8.dp))
            Icon(Icons.AutoMirrored.Rounded.VolumeUp, null, tint = p.muted)
        }
    }

    when (sheet) {
        "repeat" -> RepeatSheet(state) { sheet = null }
        "sleep" -> SleepSheet(player) { sheet = null }
    }
}

private fun japaLabel(session: SessionInfo?, target: Int): String = when {
    session?.intro == true -> session?.playLabel.orEmpty()
    target == AppState.CONTINUOUS -> "Japa ${(session?.played ?: 0) + 1} · continuous"
    target == 1 -> "Plays once"
    else -> "Japa ${minOf((session?.played ?: 0) + 1, target)} of $target"
}

/** The artwork inside a slowly turning mandala, ringed by the japa progress (repetitions done plus the current one). */
@Composable
private fun ArtStage(mantra: Mantra?, ui: PlayerUi, session: SessionInfo?, player: PlayerConnection) {
    val p = LocalPalette.current
    val position by player.position.collectAsStateWithLifecycle()
    val duration = ui.durationMs
    val fraction = when {
        session == null || session.intro || !ui.loaded || duration <= 0 -> 0f
        session.target == AppState.CONTINUOUS -> position.toFloat() / duration
        else -> ((session.played + position.toFloat() / duration) / session.target)
    }.coerceIn(0f, 1f)
    val ring by animateFloatAsState(fraction, tween(300, easing = LinearEasing), label = "japa")
    Box(Modifier.size(330.dp), contentAlignment = Alignment.Center) {
        Mandala(ui.isPlaying, Modifier.fillMaxSize())
        Canvas(Modifier.size(272.dp)) {
            val stroke = 5.dp.toPx()
            drawCircle(p.glow.copy(alpha = 0.18f), style = Stroke(stroke))
            drawArc(p.gold, -90f, 360f * ring, useCenter = false, style = Stroke(stroke, cap = StrokeCap.Round))
        }
        MantraArt(mantra, 216.dp, ui.isPlaying, glow = false)
    }
}

/** Rings of petals with a soft glow; it turns slowly only while a mantra plays, and keeps its angle when paused. */
@Composable
private fun Mandala(playing: Boolean, modifier: Modifier) {
    val p = LocalPalette.current
    val spin = remember { Animatable(0f) }
    LaunchedEffect(playing) {
        while (playing) {
            spin.snapTo(spin.value % 360f)
            spin.animateTo(spin.value + 360f, tween(120_000, easing = LinearEasing))
        }
    }
    val glow by animateFloatAsState(if (playing) 1f else 0.5f, tween(1200), label = "mandalaGlow")
    Canvas(modifier.graphicsLayer { rotationZ = spin.value }) {
        val c = center
        val r = size.minDimension / 2
        drawCircle(Brush.radialGradient(listOf(p.glow.copy(alpha = 0.32f * glow), Color.Transparent), c, r), r, c)
        val line = 1.2.dp.toPx()
        // (distance from centre, petals, petal length, petal width), as fractions of the radius.
        listOf(Triple(0.74f, 16, 0.2f to 0.1f), Triple(0.86f, 32, 0.13f to 0.06f), Triple(0.95f, 48, 0.07f to 0.035f)).forEachIndexed { k, (dist, count, dims) ->
            val (len, wid) = dims
            val color = p.glow.copy(alpha = (0.42f - k * 0.1f) * glow)
            repeat(count) { i ->
                rotate(360f / count * i + k * 7.5f, c) {
                    drawOval(color, Offset(c.x - r * wid / 2, c.y - r * dist - r * len / 2), Size(r * wid, r * len), style = Stroke(line))
                }
            }
        }
        drawCircle(p.glow.copy(alpha = 0.3f * glow), r * 0.66f, c, style = Stroke(line))
    }
}

/** The mantra's lines, the one being sung highlighted and scrolled into view. */
@Composable
private fun SyncedLyrics(lines: List<LyricLine>, active: Boolean, player: PlayerConnection) {
    val position by player.position.collectAsStateWithLifecycle()
    val current = if (active) lines.indexOfLast { it.startMs <= position } else -1
    val list = rememberLazyListState()
    LaunchedEffect(current) { if (current >= 0) list.animateScrollToItem(current) }
    GlassCard(Modifier.fillMaxWidth(), padding = PaddingValues(vertical = 6.dp)) {
        LazyColumn(
            state = list,
            modifier = Modifier.fillMaxWidth().height(220.dp),
            contentPadding = PaddingValues(horizontal = 18.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            itemsIndexed(lines) { i, line ->
                val alpha by animateFloatAsState(if (current < 0 || i == current) 1f else 0.38f, tween(450), label = "line")
                LyricLineView(line, highlighted = i == current, modifier = Modifier.graphicsLayer { this.alpha = alpha })
            }
        }
    }
}

/** Reads the playback position itself, so its 4-per-second updates redraw only this bar. */
@Composable
private fun ProgressBar(player: PlayerConnection, ui: PlayerUi, duration: Long) {
    val p = LocalPalette.current
    val position by player.position.collectAsStateWithLifecycle()
    var dragging by remember { mutableStateOf(false) }
    var dragValue by remember { mutableFloatStateOf(0f) }
    val target = if (ui.loaded && duration > 0) (position.toFloat() / duration).coerceIn(0f, 1f) else 0f
    val smooth by animateFloatAsState(target, tween(260, easing = LinearEasing), label = "progress")
    Slider(
        value = if (dragging) dragValue else smooth,
        onValueChange = { dragging = true; dragValue = it },
        onValueChangeFinished = { dragging = false; if (ui.loaded) player.seekTo((dragValue * duration).toLong()) },
        enabled = ui.loaded,
        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
    )
    Row(Modifier.fillMaxWidth()) {
        Text(
            Format.duration(if (dragging) (dragValue * duration).toLong() else if (ui.loaded) position else 0L),
            style = MaterialTheme.typography.labelMedium, color = p.muted,
        )
        Spacer(Modifier.weight(1f))
        Text(Format.duration(duration), style = MaterialTheme.typography.labelMedium, color = p.muted)
    }
}
