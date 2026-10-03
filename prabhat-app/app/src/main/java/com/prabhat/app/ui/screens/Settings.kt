package com.prabhat.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AccessTime
import androidx.compose.material.icons.rounded.AppSettingsAlt
import androidx.compose.material.icons.rounded.LibraryMusic
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import com.prabhat.app.BuildConfig
import com.prabhat.app.data.AppState
import com.prabhat.app.data.Store
import com.prabhat.app.data.ThemeMode
import com.prabhat.app.domain.Format
import com.prabhat.app.domain.ScheduleMath
import com.prabhat.app.ui.BackgroundChecklist
import com.prabhat.app.ui.Routes
import com.prabhat.app.ui.SystemAccess
import com.prabhat.app.ui.components.ActionRow
import com.prabhat.app.ui.components.Eyebrow
import com.prabhat.app.ui.components.GlassCard
import com.prabhat.app.ui.components.OptionChips
import com.prabhat.app.ui.components.ToggleRow
import com.prabhat.app.ui.tab
import com.prabhat.app.ui.theme.LocalPalette

@Composable
fun SettingsScreen(state: AppState, pad: PaddingValues, nav: NavHostController) {
    val p = LocalPalette.current
    val context = LocalContext.current
    var pickDefault by remember { mutableStateOf(false) }
    var editTime by remember { mutableStateOf(false) }
    val first = state.schedules.firstOrNull()

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).statusBarsPadding()
            .padding(bottom = pad.calculateBottomPadding() + 24.dp).padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Spacer(Modifier.height(6.dp))
        Text("Settings", style = MaterialTheme.typography.headlineMedium)

        Section("Morning session") {
            ActionRow(
                Icons.Rounded.AccessTime, "Morning playback time",
                first?.let { Format.time(it.hour, it.minute) + " · " + ScheduleMath.daysLabel(it.days) } ?: "Not set",
            ) { editTime = true }
            ActionRow(Icons.Rounded.Star, "Default mantra", state.defaultMantra?.name ?: "None") { pickDefault = true }
            Label("Repeat count")
            OptionChips(AppState.REPEAT_OPTIONS, state.repeat, Format::repeat) { r -> Store.update { it.copy(repeat = r) } }
            Label("Volume · ${(state.volume * 100).toInt()}%")
            Slider(
                value = state.volume,
                onValueChange = { v -> Store.update { it.copy(volume = v) } },
                colors = SliderDefaults.colors(thumbColor = p.gold, activeTrackColor = p.gold, inactiveTrackColor = p.gold.copy(alpha = 0.2f)),
            )
            Label("Gentle fade-in")
            OptionChips(AppState.FADE_OPTIONS, state.fadeInSeconds, Format::fade) { f -> Store.update { it.copy(fadeInSeconds = f) } }
        }

        Section("Notifications") {
            ToggleRow("Reminder before the session", "“Your morning mantra starts in ${state.reminderLeadMinutes} minutes.”", state.notifyReminder) { on ->
                Store.update { it.copy(notifyReminder = on) }
            }
            if (state.notifyReminder) {
                OptionChips(listOf(5, 10, 15, 30), state.reminderLeadMinutes, { "$it min" }) { m -> Store.update { it.copy(reminderLeadMinutes = m) } }
            }
            ToggleRow("When the session starts", "“Your morning mantra is starting.”", state.notifyStart) { on -> Store.update { it.copy(notifyStart = on) } }
            ToggleRow("When the session completes", "“Morning session completed.”", state.notifyComplete) { on -> Store.update { it.copy(notifyComplete = on) } }
        }

        Section("Appearance") {
            OptionChips(ThemeMode.entries, state.theme, {
                when (it) { ThemeMode.SYSTEM -> "System"; ThemeMode.LIGHT -> "Light"; ThemeMode.DARK -> "Dark" }
            }) { t -> Store.update { it.copy(theme = t) } }
        }

        Section("Background playback") {
            BackgroundChecklist()
            Spacer(Modifier.height(8.dp))
            Text(
                "Your mantra plays through a media notification with lock-screen, Bluetooth and headphone controls. " +
                    "It pauses for phone calls and resumes afterwards, and pauses if headphones are unplugged. " +
                    "If your phone has an “Autostart”, “Sleeping apps” or “Background activity” setting, allow Prabhat there so the morning session is never blocked.",
                style = MaterialTheme.typography.bodySmall, color = p.muted,
            )
            ActionRow(Icons.Rounded.AppSettingsAlt, "Open app settings", "Battery, autostart and permissions") { SystemAccess.appInfo(context) }
        }

        Section("Library") {
            ActionRow(Icons.Rounded.LibraryMusic, "Manage audio library", "${state.mantras.size} mantras") { nav.tab(Routes.LIBRARY) }
        }

        Section("About") {
            Text("Prabhat ${BuildConfig.VERSION_NAME}", style = MaterialTheme.typography.titleMedium)
            Text("Wake up → mantra starts automatically → peaceful morning.", color = p.muted, style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(6.dp))
            Text(
                "Works fully offline. No account. Your mantras and settings stay on this phone.",
                color = p.muted, style = MaterialTheme.typography.bodySmall,
            )
            Spacer(Modifier.height(10.dp))
            Text("Developed by Santanu Bordoloi", style = MaterialTheme.typography.titleSmall, color = p.gold)
        }
    }

    if (editTime) ScheduleEditor(state, first) { editTime = false }
    if (pickDefault) {
        AlertDialog(
            onDismissRequest = { pickDefault = false },
            title = { Text("Default mantra") },
            text = {
                Column {
                    state.mantras.forEach { m ->
                        androidx.compose.foundation.layout.Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            RadioButton(selected = m.id == state.defaultMantra?.id, onClick = {
                                Store.update { it.copy(defaultMantraId = m.id) }; pickDefault = false
                            })
                            Text(m.name)
                        }
                    }
                    if (state.mantras.isEmpty()) Text("Add a mantra in the Mantras tab first.")
                }
            },
            confirmButton = { TextButton(onClick = { pickDefault = false }) { Text("Done") } },
        )
    }
}

@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
    GlassCard(Modifier.fillMaxWidth()) {
        Eyebrow(title)
        Spacer(Modifier.height(8.dp))
        content()
    }
}

@Composable
private fun Label(text: String) {
    Text(text, style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 12.dp, bottom = 8.dp))
}
