@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)

package com.prabhat.app.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.TimePickerDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.prabhat.app.R
import com.prabhat.app.data.AppState
import com.prabhat.app.data.Library
import com.prabhat.app.data.Mantra
import com.prabhat.app.data.ScheduleRule
import com.prabhat.app.data.Store
import com.prabhat.app.domain.Format
import com.prabhat.app.playback.PlaybackHub
import com.prabhat.app.playback.PlayerConnection
import com.prabhat.app.ui.components.OptionChips
import com.prabhat.app.ui.components.rememberNow
import com.prabhat.app.ui.theme.LocalPalette
import java.time.DayOfWeek

@Composable
private fun Sheet(title: String, subtitle: String? = null, onDismiss: () -> Unit, content: @Composable () -> Unit) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = MaterialTheme.colorScheme.surface,
    ) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 24.dp).padding(bottom = 24.dp).navigationBarsPadding()) {
            Text(title, style = MaterialTheme.typography.headlineSmall)
            subtitle?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = LocalPalette.current.muted) }
            Spacer(Modifier.height(20.dp))
            content()
        }
    }
}

@Composable
fun RepeatSheet(state: AppState, onDismiss: () -> Unit) {
    Sheet("Repeat", "How many times the mantra plays in a session.", onDismiss) {
        OptionChips(AppState.REPEAT_OPTIONS, state.repeat, Format::repeat) { r -> Store.update { it.copy(repeat = r) } }
    }
}

@Composable
fun SleepSheet(player: PlayerConnection, onDismiss: () -> Unit) {
    val timer by PlaybackHub.sleep.collectAsStateWithLifecycle()
    val ui by player.ui.collectAsStateWithLifecycle()
    val now by rememberNow(1000)
    val status = timer?.let { t ->
        if (t.endOfMantra) "Pauses at the end of this mantra."
        else "Pauses in ${Format.duration((t.endsAt ?: 0L) - now.toInstant().toEpochMilli())}."
    }
    Sheet("Sleep timer", status ?: "Gently fade out and pause after a while.", onDismiss) {
        if (!ui.loaded) {
            Text("Start a mantra first, then set the timer.", color = LocalPalette.current.muted)
        } else {
            OptionChips(
                PlaybackHub.SLEEP_OPTIONS,
                null,
                { if (it == PlaybackHub.END_OF_MANTRA) "End of current mantra" else "$it minutes" },
            ) { player.send(PlaybackHub.Command.Sleep(it)); onDismiss() }
            if (timer != null) {
                Spacer(Modifier.height(16.dp))
                OutlinedButton(onClick = { player.send(PlaybackHub.Command.Sleep(PlaybackHub.CANCEL)); onDismiss() }) { Text("Turn off timer") }
            }
        }
    }
}

/** True when a mantra has words to show. */
fun hasText(m: Mantra) = m.lyrics.isNotBlank()

/** The words of the mantra, large and centred. */
@Composable
fun LyricsSheet(mantra: Mantra, onDismiss: () -> Unit) {
    Sheet(mantra.name, null, onDismiss) {
        Column(Modifier.verticalScroll(rememberScrollState()), horizontalAlignment = Alignment.CenterHorizontally) {
            Lyrics(mantra)
        }
    }
}

@Composable
fun Lyrics(mantra: Mantra) {
    Text(
        mantra.lyrics,
        style = MaterialTheme.typography.titleLarge.copy(lineHeight = 38.sp),
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth(),
    )
}

val DAY_PRESETS = listOf(
    "Every day" to ScheduleRule.ALL_DAYS,
    "Mon–Fri" to setOf(1, 2, 3, 4, 5),
    "Weekends" to setOf(6, 7),
)

@Composable
fun DayPicker(days: Set<Int>, onChange: (Set<Int>) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        OptionChips(DAY_PRESETS, DAY_PRESETS.firstOrNull { it.second == days }, { it.first }) { onChange(it.second) }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            (1..7).forEach { d ->
                FilterChip(
                    selected = d in days,
                    onClick = { onChange(if (d in days) days - d else days + d) },
                    label = { Text(DayOfWeek.of(d).name.take(1), modifier = Modifier.padding(vertical = 8.dp)) },
                    shape = RoundedCornerShape(50),
                )
            }
        }
    }
}

/** Edit a schedule's time, days and mantra. [rule] null creates a new one. */
@Composable
fun ScheduleEditor(state: AppState, rule: ScheduleRule?, presetMantra: String? = null, onDismiss: () -> Unit) {
    val base = rule ?: ScheduleRule(id = "r" + System.currentTimeMillis(), mantraId = presetMantra)
    val time = rememberTimePickerState(base.hour, base.minute, is24Hour = false)
    var days by remember { mutableStateOf(base.days) }
    var mantraId by remember { mutableStateOf(base.mantraId) }
    val p = LocalPalette.current
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (rule == null) "New morning time" else "Change time") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                TimePicker(
                    state = time,
                    colors = TimePickerDefaults.colors(
                        selectorColor = p.gold,
                        timeSelectorSelectedContainerColor = p.gold.copy(alpha = 0.2f),
                        periodSelectorSelectedContainerColor = p.gold.copy(alpha = 0.2f),
                    ),
                )
                Text("Days", style = MaterialTheme.typography.titleSmall)
                DayPicker(days) { days = it }
                if (state.mantras.size > 1) {
                    Text("Mantra", style = MaterialTheme.typography.titleSmall)
                    OptionChips(
                        listOf<String?>(null) + state.mantras.map { it.id },
                        mantraId,
                        { id -> if (id == null) "Default (${state.defaultMantra?.name ?: "none"})" else state.mantra(id)?.name ?: "" },
                    ) { mantraId = it }
                }
            }
        },
        confirmButton = {
            TextButton(enabled = days.isNotEmpty(), onClick = {
                val saved = base.copy(hour = time.hour, minute = time.minute, days = days, mantraId = mantraId, enabled = true)
                Store.update { s ->
                    val exists = s.schedules.any { it.id == saved.id }
                    s.copy(
                        schedules = if (exists) s.schedules.map { if (it.id == saved.id) saved else it } else s.schedules + saved,
                        scheduleOn = true,
                    )
                }
                onDismiss()
            }) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
