package com.prabhat.app.ui.screens

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Alarm
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.WbSunny
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import com.prabhat.app.data.AppState
import com.prabhat.app.data.Library
import com.prabhat.app.data.Store
import com.prabhat.app.domain.Format
import com.prabhat.app.playback.PlaybackHub
import com.prabhat.app.playback.PlayerConnection
import com.prabhat.app.ui.Routes
import com.prabhat.app.ui.components.ActionRow
import com.prabhat.app.ui.components.BigPlayButton
import com.prabhat.app.ui.components.Eyebrow
import com.prabhat.app.ui.components.GlassCard
import com.prabhat.app.ui.components.MantraArt
import com.prabhat.app.ui.components.OptionChips
import com.prabhat.app.ui.theme.LocalPalette
import kotlinx.coroutines.launch

@Composable
fun MantraScreen(state: AppState, player: PlayerConnection, pad: PaddingValues, nav: NavHostController, id: String) {
    val p = LocalPalette.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val ui by player.ui.collectAsStateWithLifecycle()
    val m = state.mantra(id)
    LaunchedEffect(m == null) { if (m == null) nav.popBackStack() }
    if (m == null) return

    var dialog by remember { mutableStateOf<String?>(null) }
    val cover = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) scope.launch {
            Library.setCover(context, m.id, uri).onFailure { PlaybackHub.error.value = it.message ?: "That image could not be used." }
        }
    }
    val available = remember(m.file) { Library.isAvailable(m) }
    val playing = ui.mantraId == m.id && ui.isPlaying

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).statusBarsPadding()
            .padding(bottom = pad.calculateBottomPadding() + 24.dp).padding(horizontal = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Row(Modifier.fillMaxWidth().padding(top = 8.dp)) {
            IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") }
        }
        MantraArt(m, 230.dp, playing)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(m.name, style = MaterialTheme.typography.headlineSmall, textAlign = TextAlign.Center, modifier = Modifier.weight(1f, fill = false))
            IconButton(onClick = { dialog = "rename" }) { Icon(Icons.Rounded.Edit, "Rename", tint = p.muted) }
        }
        Text(
            if (available) Format.duration(m.durationMs) else "Audio file missing — remove it and add it again.",
            color = if (available) p.muted else MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium,
        )
        Spacer(Modifier.height(16.dp))
        if (available) BigPlayButton(playing) { player.toggle(m, ui) }
        Spacer(Modifier.height(20.dp))

        if (m.lyrics.isNotBlank()) {
            GlassCard(Modifier.fillMaxWidth()) {
                Eyebrow("Mantra")
                Spacer(Modifier.height(12.dp))
                Lyrics(m)
            }
            Spacer(Modifier.height(12.dp))
        }

        GlassCard(Modifier.fillMaxWidth()) {
            Eyebrow("About")
            Spacer(Modifier.height(6.dp))
            Text(m.description.ifBlank { "Add a short description or intention for this mantra." }, color = if (m.description.isBlank()) p.muted else MaterialTheme.colorScheme.onSurface)
            TextButton(onClick = { dialog = "describe" }) { Text(if (m.description.isBlank()) "Add description" else "Edit description") }
        }
        Spacer(Modifier.height(12.dp))

        GlassCard(Modifier.fillMaxWidth()) {
            Eyebrow("Repeat")
            Spacer(Modifier.height(10.dp))
            OptionChips(AppState.REPEAT_OPTIONS, state.repeat, Format::repeat) { r -> Store.update { it.copy(repeat = r) } }
        }
        Spacer(Modifier.height(12.dp))

        GlassCard(Modifier.fillMaxWidth(), padding = PaddingValues(horizontal = 20.dp, vertical = 8.dp)) {
            ActionRow(Icons.Rounded.Alarm, "Schedule this mantra", "Play it automatically in the morning") {
                nav.navigate(Routes.SCHEDULE + "?mantra=" + m.id) { launchSingleTop = true }
            }
            if (state.defaultMantra?.id != m.id) {
                ActionRow(Icons.Rounded.Star, "Set as default mantra", "Used by schedules without their own choice") {
                    Store.update { it.copy(defaultMantraId = m.id) }
                }
            }
            ActionRow(Icons.Rounded.Image, if (m.cover == null) "Add cover image" else "Change cover image", null) {
                cover.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
            }
            if (m.cover != null) {
                ActionRow(Icons.Rounded.WbSunny, "Use the Prabhat artwork", null) {
                    Store.update { s -> s.copy(mantras = s.mantras.map { if (it.id == m.id) it.copy(cover = null) else it }) }
                }
            }
            ActionRow(Icons.Rounded.DeleteOutline, "Delete mantra", null) { dialog = "delete" }
        }
    }

    when (dialog) {
        "rename" -> TextDialog("Rename", m.name, singleLine = true, onDismiss = { dialog = null }) { Library.rename(m.id, it) }
        "describe" -> TextDialog("Description", m.description, singleLine = false, onDismiss = { dialog = null }) { Library.describe(m.id, it) }
        "delete" -> AlertDialog(
            onDismissRequest = { dialog = null },
            title = { Text("Delete “${m.name}”?") },
            text = { Text("It is removed from Prabhat. Schedules using it will play your default mantra instead.") },
            confirmButton = {
                TextButton(onClick = {
                    dialog = null
                    if (ui.mantraId == m.id) player.pause()
                    Library.delete(m.id)
                }) { Text("Delete", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { dialog = null }) { Text("Cancel") } },
        )
    }
}

@Composable
fun TextDialog(title: String, initial: String, singleLine: Boolean, onDismiss: () -> Unit, onSave: (String) -> Unit) {
    var text by remember { mutableStateOf(initial) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            OutlinedTextField(
                text, { text = it }, singleLine = singleLine, minLines = if (singleLine) 1 else 3,
                modifier = Modifier.fillMaxWidth(),
            )
        },
        confirmButton = { TextButton(onClick = { onSave(text); onDismiss() }) { Text("Save") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

