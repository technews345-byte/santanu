@file:OptIn(ExperimentalMaterial3Api::class)

package com.prabhat.app.ui.screens

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.RadioButtonUnchecked
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimeInput
import androidx.compose.material3.TimePickerDefaults
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.prabhat.app.data.AppState
import com.prabhat.app.data.ScheduleRule
import com.prabhat.app.data.Store
import com.prabhat.app.domain.Format
import com.prabhat.app.domain.ScheduleMath
import com.prabhat.app.playback.PlayerConnection
import com.prabhat.app.ui.BackgroundChecklist
import com.prabhat.app.ui.components.Eyebrow
import com.prabhat.app.ui.components.GlassCard
import com.prabhat.app.ui.components.MantraArt
import com.prabhat.app.ui.components.OptionChips
import com.prabhat.app.ui.theme.LocalPalette

private const val STEPS = 6

@Composable
fun OnboardingScreen(state: AppState, player: PlayerConnection) {
    val p = LocalPalette.current
    var step by rememberSaveable { mutableIntStateOf(0) }
    val rule = state.schedules.firstOrNull() ?: ScheduleRule(id = "morning")
    val time = rememberTimePickerState(rule.hour, rule.minute, is24Hour = false)
    var days by rememberSaveable { mutableStateOf(rule.days.toList()) }
    val snack = remember { SnackbarHostState() }

    fun saveTime() = Store.update { s ->
        val saved = rule.copy(hour = time.hour, minute = time.minute, days = days.toSet(), enabled = true)
        s.copy(schedules = listOf(saved) + s.schedules.filter { it.id != saved.id }, scheduleOn = true)
    }

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(horizontal = 24.dp)) {
            // Progress dots
            Row(Modifier.fillMaxWidth().padding(top = 16.dp), horizontalArrangement = Arrangement.Center) {
                repeat(STEPS) { i ->
                    Box(
                        Modifier.padding(4.dp).size(if (i == step) 22.dp else 8.dp, 8.dp)
                            .background(if (i <= step) p.gold else p.gold.copy(alpha = 0.25f), CircleShape)
                    )
                }
            }
            AnimatedContent(step, transitionSpec = { fadeIn() togetherWith fadeOut() }, modifier = Modifier.weight(1f), label = "step") { s ->
                Column(
                    Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(vertical = 20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = if (s == 0 || s == 5) Arrangement.Center else Arrangement.Top,
                ) {
                    when (s) {
                        0 -> Welcome()
                        1 -> ChooseMantra(state, player, snack)
                        2 -> {
                            Heading("Step 2", "Choose your morning time", "Prabhat will play your mantra automatically at this time.")
                            GlassCard(Modifier.fillMaxWidth()) {
                                Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                                    TimeInput(
                                        state = time,
                                        colors = TimePickerDefaults.colors(
                                            timeSelectorSelectedContainerColor = p.gold.copy(alpha = 0.2f),
                                            periodSelectorSelectedContainerColor = p.gold.copy(alpha = 0.2f),
                                        ),
                                    )
                                }
                                Spacer(Modifier.height(8.dp))
                                Text("Days", style = MaterialTheme.typography.titleSmall)
                                Spacer(Modifier.height(8.dp))
                                DayPicker(days.toSet()) { days = it.toList() }
                            }
                        }
                        3 -> {
                            Heading("Step 3", "Choose repeat count", "How many times the mantra plays each morning. The mantra asks to be heard 3 times.")
                            GlassCard(Modifier.fillMaxWidth()) {
                                OptionChips(AppState.REPEAT_OPTIONS, state.repeat, Format::repeat) { r -> Store.update { it.copy(repeat = r) } }
                            }
                        }
                        4 -> {
                            Heading(
                                "Step 4", "Allow it to play on its own",
                                "So your mantra can start while the phone is locked and Prabhat is closed.",
                            )
                            GlassCard(Modifier.fillMaxWidth()) { BackgroundChecklist() }
                        }
                        else -> Finish(state, time.hour, time.minute, days.toSet())
                    }
                }
            }
            Row(Modifier.fillMaxWidth().padding(bottom = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                if (step > 0) TextButton(onClick = { step-- }) { Text("Back") }
                Spacer(Modifier.weight(1f))
                Button(
                    onClick = {
                        if (step == 2) saveTime()
                        if (step < STEPS - 1) step++ else Store.update { it.copy(onboarded = true) }
                    },
                    enabled = !(step == 1 && state.mantras.isEmpty()) && !(step == 2 && days.isEmpty()),
                    colors = ButtonDefaults.buttonColors(containerColor = p.gold),
                    contentPadding = PaddingValues(horizontal = 28.dp, vertical = 14.dp),
                ) { Text(when (step) { 0 -> "Begin"; STEPS - 1 -> "Start my mornings"; else -> "Continue" }) }
            }
        }
        SnackbarHost(snack, Modifier.align(Alignment.BottomCenter).padding(bottom = 80.dp))
    }
}

@Composable
private fun Heading(eyebrow: String, title: String, text: String) {
    Column(Modifier.fillMaxWidth().padding(bottom = 20.dp)) {
        Eyebrow(eyebrow)
        Spacer(Modifier.height(6.dp))
        Text(title, style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(6.dp))
        Text(text, style = MaterialTheme.typography.bodyLarge, color = LocalPalette.current.muted)
    }
}

@Composable
private fun Welcome() {
    MantraArt(null, 200.dp, playing = true)
    Spacer(Modifier.height(16.dp))
    Text("Prabhat", style = MaterialTheme.typography.displaySmall, color = LocalPalette.current.gold)
    Spacer(Modifier.height(8.dp))
    Text("Create Your Peaceful Morning", style = MaterialTheme.typography.headlineSmall, textAlign = TextAlign.Center)
    Spacer(Modifier.height(8.dp))
    Text(
        "Wake up, and your mantra begins on its own — softly, at the time you choose.",
        style = MaterialTheme.typography.bodyLarge, color = LocalPalette.current.muted, textAlign = TextAlign.Center,
    )
    Spacer(Modifier.height(28.dp))
    Text("Developed by Santanu Bordoloi", style = MaterialTheme.typography.labelLarge, color = LocalPalette.current.gold)
}

@Composable
private fun ChooseMantra(state: AppState, player: PlayerConnection, snack: SnackbarHostState) {
    val p = LocalPalette.current
    val ui by player.ui.collectAsStateWithLifecycle()
    val (busy, pick) = rememberAudioImport(snack) { m -> Store.update { it.copy(defaultMantraId = m.id) } }
    Heading("Step 1", "Choose your mantra", "This mantra plays every morning. You can add more later.")
    state.mantras.forEach { m ->
        val selected = m.id == state.defaultMantra?.id
        GlassCard(
            Modifier.fillMaxWidth().padding(bottom = 10.dp),
            onClick = { Store.update { it.copy(defaultMantraId = m.id) } },
            padding = PaddingValues(12.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(if (selected) Icons.Rounded.CheckCircle else Icons.Rounded.RadioButtonUnchecked, null, tint = p.gold)
                Spacer(Modifier.width(8.dp))
                Box(Modifier.size(60.dp), contentAlignment = Alignment.Center) { MantraArt(m, 48.dp, glow = false) }
                Column(Modifier.weight(1f).padding(start = 8.dp)) {
                    Text(m.name, style = MaterialTheme.typography.titleMedium)
                    Text(Format.duration(m.durationMs), style = MaterialTheme.typography.bodySmall, color = p.muted)
                }
                val playing = ui.mantraId == m.id && ui.isPlaying
                IconButton(onClick = { player.toggle(m, ui) }) {
                    Icon(if (playing) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, if (playing) "Pause" else "Preview", tint = p.gold)
                }
            }
        }
    }
    OutlinedButton(onClick = pick, enabled = !busy, modifier = Modifier.fillMaxWidth().height(52.dp)) {
        Icon(Icons.Rounded.Add, null)
        Text(if (busy) "  Adding…" else "  Add your own (MP3, M4A, WAV)")
    }
}

@Composable
private fun Finish(state: AppState, hour: Int, minute: Int, days: Set<Int>) {
    MantraArt(state.defaultMantra, 180.dp, playing = true)
    Spacer(Modifier.height(20.dp))
    Text("You're all set 🌅", style = MaterialTheme.typography.headlineMedium)
    Spacer(Modifier.height(10.dp))
    Text(
        "Your morning mantra will play automatically at ${Format.time(hour, minute)}" +
            if (days.size == 7) "." else " (${ScheduleMath.daysLabel(days)}).",
        style = MaterialTheme.typography.bodyLarge, textAlign = TextAlign.Center,
    )
    Spacer(Modifier.height(6.dp))
    Text(
        listOfNotNull(
            state.defaultMantra?.name ?: "Your mantra",
            Format.repeat(state.repeat),
            if (state.fadeInSeconds > 0) "fades in over ${state.fadeInSeconds} seconds" else null,
        ).joinToString(" · "),
        style = MaterialTheme.typography.bodyMedium, color = LocalPalette.current.muted, textAlign = TextAlign.Center,
    )
}
