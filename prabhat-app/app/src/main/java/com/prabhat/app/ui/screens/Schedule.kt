package com.prabhat.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.prabhat.app.data.AppState
import com.prabhat.app.data.ScheduleRule
import com.prabhat.app.data.Store
import com.prabhat.app.domain.Format
import com.prabhat.app.domain.ScheduleMath
import com.prabhat.app.ui.BackgroundChecklist
import com.prabhat.app.ui.components.Eyebrow
import com.prabhat.app.ui.components.GlassCard
import com.prabhat.app.ui.components.rememberNow
import com.prabhat.app.ui.theme.LocalPalette

@Composable
fun ScheduleScreen(state: AppState, pad: PaddingValues, presetMantra: String?) {
    val p = LocalPalette.current
    val now by rememberNow(10_000)
    // Opened from a mantra's "Schedule" button: start a new time for that mantra (once).
    var editing by rememberSaveable { mutableStateOf<String?>(if (presetMantra != null) NEW else null) }
    var presetUsed by rememberSaveable { mutableStateOf(false) }
    val next = if (state.scheduleOn) ScheduleMath.next(state.schedules, now) else null

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).statusBarsPadding()
            .padding(bottom = pad.calculateBottomPadding() + 24.dp).padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Spacer(Modifier.height(6.dp))
        Text("Schedule", style = MaterialTheme.typography.headlineMedium)

        GlassCard(Modifier.fillMaxWidth()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Eyebrow("Morning sessions")
                    Text(
                        when {
                            !state.scheduleOn -> "Paused — your mantra will not play automatically."
                            next != null -> "Next: ${next.at.dayOfWeek.name.lowercase().replaceFirstChar { it.uppercase() }} at ${Format.time(next.at.toLocalTime())} · starts in ${ScheduleMath.countdown(now, next.at)}"
                            else -> "Add a time below."
                        },
                        style = MaterialTheme.typography.bodyMedium, color = p.muted,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
                Switch(
                    checked = state.scheduleOn,
                    onCheckedChange = { on -> Store.update { it.copy(scheduleOn = on) } },
                    colors = SwitchDefaults.colors(checkedTrackColor = p.gold),
                    modifier = Modifier.padding(start = 12.dp),
                )
            }
        }

        state.schedules.forEach { rule ->
            RuleCard(state, rule, onEdit = { editing = rule.id })
        }

        OutlinedButton(onClick = { editing = NEW }, modifier = Modifier.fillMaxWidth().height(52.dp)) {
            Icon(Icons.Rounded.Add, null)
            Text("  Add another time")
        }

        GlassCard(Modifier.fillMaxWidth()) {
            Eyebrow("Make sure it plays")
            Spacer(Modifier.height(12.dp))
            BackgroundChecklist()
            Spacer(Modifier.height(12.dp))
            Text(
                "Prabhat uses Android's alarm system, so your mantra starts even when the app is closed or the screen is locked, " +
                    "and the schedule is restored after a restart. Some phones (Xiaomi, Oppo, Vivo, Realme, OnePlus, Samsung) " +
                    "also have an “Autostart” or “Sleeping apps” setting — allow Prabhat there too.",
                style = MaterialTheme.typography.bodySmall, color = p.muted,
            )
        }
    }

    editing?.let { id ->
        val rule = state.schedules.firstOrNull { it.id == id }
        val preset = if (id == NEW && !presetUsed) presetMantra else null
        ScheduleEditor(state, rule, preset) { editing = null; presetUsed = true }
    }
}

private const val NEW = "new"

@Composable
private fun RuleCard(state: AppState, rule: ScheduleRule, onEdit: () -> Unit) {
    val p = LocalPalette.current
    val active = state.scheduleOn && rule.enabled
    GlassCard(Modifier.fillMaxWidth(), onClick = onEdit) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(
                    Format.time(rule.hour, rule.minute),
                    style = MaterialTheme.typography.displaySmall.copy(fontSize = 38.sp),
                    color = if (active) MaterialTheme.colorScheme.onSurface else p.muted,
                )
                Text(ScheduleMath.daysLabel(rule.days), style = MaterialTheme.typography.bodyMedium, color = if (active) p.gold else p.muted)
                Text(
                    (state.mantraFor(rule)?.name ?: "No mantra") + " · " + Format.repeat(state.repeatFor(rule)),
                    style = MaterialTheme.typography.bodySmall, color = p.muted,
                )
                Text("Tap to change the time", style = MaterialTheme.typography.labelSmall, color = p.muted.copy(alpha = 0.8f))
            }
            Column(horizontalAlignment = Alignment.End) {
                Switch(
                    checked = rule.enabled,
                    onCheckedChange = { on ->
                        Store.update { s -> s.copy(schedules = s.schedules.map { if (it.id == rule.id) it.copy(enabled = on) else it }) }
                    },
                    colors = SwitchDefaults.colors(checkedTrackColor = p.gold),
                )
                IconButton(onClick = { Store.update { s -> s.copy(schedules = s.schedules.filter { it.id != rule.id }) } }) {
                    Icon(Icons.Rounded.DeleteOutline, "Delete this time", tint = p.muted)
                }
            }
        }
    }
}
