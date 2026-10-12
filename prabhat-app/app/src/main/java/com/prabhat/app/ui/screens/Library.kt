package com.prabhat.app.ui.screens

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Alarm
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import com.prabhat.app.data.AppState
import com.prabhat.app.data.Library
import com.prabhat.app.data.Mantra
import com.prabhat.app.domain.Format
import com.prabhat.app.playback.PlaybackHub
import com.prabhat.app.playback.PlayerConnection
import com.prabhat.app.playback.PlayerUi
import com.prabhat.app.playback.SessionKind
import com.prabhat.app.ui.Routes
import com.prabhat.app.ui.components.GlassCard
import com.prabhat.app.ui.components.MantraArt
import com.prabhat.app.ui.theme.LocalPalette
import kotlinx.coroutines.launch

/** Plays [m], or toggles play/pause when it is the mantra already loaded. */
fun PlayerConnection.toggle(m: Mantra, ui: PlayerUi) {
    when {
        ui.mantraId == m.id && ui.isPlaying -> pause()
        ui.mantraId == m.id && ui.loaded -> play()
        else -> send(PlaybackHub.Command.Start(m.id, SessionKind.MANUAL, resume = false, fade = false))
    }
}

/** Launches the system file picker for audio and imports the choice, reporting progress and errors. */
@Composable
fun rememberAudioImport(snack: SnackbarHostState, onAdded: (Mantra) -> Unit = {}): Pair<Boolean, () -> Unit> {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        busy = true
        scope.launch {
            Library.import(context, uri)
                .onSuccess { onAdded(it); snack.showSnackbar("“${it.name}” added") }
                .onFailure { snack.showSnackbar(it.message ?: "That file could not be added.") }
            busy = false
        }
    }
    return busy to { launcher.launch(arrayOf("audio/*")) }
}

@Composable
fun LibraryScreen(state: AppState, player: PlayerConnection, pad: PaddingValues, nav: NavHostController) {
    val p = LocalPalette.current
    val ui by player.ui.collectAsStateWithLifecycle()
    val snack = remember { SnackbarHostState() }
    val (busy, pick) = rememberAudioImport(snack)

    Box(Modifier.fillMaxSize()) {
        LazyColumn(
            Modifier.fillMaxSize().statusBarsPadding(),
            contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 20.dp, bottom = pad.calculateBottomPadding() + 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Mantras", style = MaterialTheme.typography.headlineMedium)
                        Text(
                            if (state.mantras.size == 1) "1 mantra" else "${state.mantras.size} mantras",
                            style = MaterialTheme.typography.bodyMedium, color = p.muted,
                        )
                    }
                    Button(onClick = pick, enabled = !busy, colors = ButtonDefaults.buttonColors(containerColor = p.gold)) {
                        if (busy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                        else Icon(Icons.Rounded.Add, null, Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(if (busy) "Adding…" else "Add")
                    }
                }
                Spacer(Modifier.height(8.dp))
            }
            if (state.mantras.isEmpty()) {
                item {
                    GlassCard(Modifier.fillMaxWidth()) {
                        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                            MantraArt(null, 120.dp, glow = false)
                            Text("Your library is empty", style = MaterialTheme.typography.titleLarge)
                            Text(
                                "Add an MP3, M4A or WAV mantra from your phone. It is copied into Prabhat, so it keeps working offline.",
                                style = MaterialTheme.typography.bodyMedium, color = p.muted, textAlign = TextAlign.Center,
                            )
                            Spacer(Modifier.height(12.dp))
                            Button(onClick = pick, colors = ButtonDefaults.buttonColors(containerColor = p.gold)) { Text("Add mantra") }
                        }
                    }
                }
            }
            items(state.mantras, key = { it.id }) { m ->
                MantraCard(
                    m, isDefault = m.id == state.defaultMantra?.id, ui = ui,
                    onOpen = { nav.navigate(Routes.mantra(m.id)) },
                    onPlay = { player.toggle(m, ui) },
                    onSchedule = { nav.navigate(Routes.SCHEDULE + "?mantra=" + m.id) { launchSingleTop = true } },
                )
            }
        }
        SnackbarHost(snack, Modifier.align(Alignment.BottomCenter).padding(bottom = pad.calculateBottomPadding()))
    }
}

@Composable
private fun MantraCard(m: Mantra, isDefault: Boolean, ui: PlayerUi, onOpen: () -> Unit, onPlay: () -> Unit, onSchedule: () -> Unit) {
    val p = LocalPalette.current
    val available = remember(m.file) { Library.isAvailable(m) }
    val playing = ui.mantraId == m.id && ui.isPlaying
    GlassCard(Modifier.fillMaxWidth(), onClick = onOpen, padding = PaddingValues(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(76.dp), contentAlignment = Alignment.Center) { MantraArt(m, 60.dp, playing, glow = false) }
            Spacer(Modifier.width(8.dp))
            Column(Modifier.weight(1f)) {
                Text(m.name, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                if (available) {
                    Text(
                        Format.duration(m.durationMs) + if (isDefault) "  ·  Default" else "",
                        style = MaterialTheme.typography.bodySmall, color = if (isDefault) p.gold else p.muted,
                    )
                } else {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Rounded.ErrorOutline, null, tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(14.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Audio file missing", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                    }
                }
            }
            IconButton(onClick = onSchedule) { Icon(Icons.Rounded.Alarm, "Schedule ${m.name}", tint = p.muted) }
            IconButton(onClick = onPlay, enabled = available) {
                Icon(if (playing) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, if (playing) "Pause" else "Play ${m.name}", tint = p.gold, modifier = Modifier.size(30.dp))
            }
        }
    }
}
