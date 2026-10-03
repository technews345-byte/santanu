package com.prabhat.app.ui

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AccessAlarm
import androidx.compose.material.icons.rounded.BatteryChargingFull
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.prabhat.app.notify.Notifier
import com.prabhat.app.schedule.Scheduler
import com.prabhat.app.ui.components.rememberResumeTick
import com.prabhat.app.ui.theme.LocalPalette

/** System settings that decide whether the morning session can start on its own. */
object SystemAccess {
    fun batteryUnrestricted(c: Context): Boolean =
        c.getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(c.packageName)

    private fun open(c: Context, intent: Intent) {
        try {
            c.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: ActivityNotFoundException) {
            appInfo(c)
        } catch (_: SecurityException) {
            appInfo(c)
        }
    }

    fun appInfo(c: Context) = runCatching {
        c.startActivity(
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${c.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
    }

    fun battery(c: Context) = open(c, Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))

    fun exactAlarms(c: Context) {
        if (Build.VERSION.SDK_INT >= 31) open(c, Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${c.packageName}")))
    }

    fun notifications(c: Context) {
        if (Build.VERSION.SDK_INT >= 26) {
            open(c, Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, c.packageName))
        } else appInfo(c)
    }
}

/** Returns a function that asks for notification permission, or opens notification settings once asking no longer works. */
@Composable
fun rememberNotificationRequest(onDone: () -> Unit = {}): () -> Unit {
    val context = LocalContext.current
    var denied by rememberSaveable { mutableStateOf(false) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        if (!ok) denied = true
        onDone()
    }
    return {
        if (Build.VERSION.SDK_INT >= 33 && !denied) launcher.launch(Manifest.permission.POST_NOTIFICATIONS)
        else SystemAccess.notifications(context)
    }
}

/** Notifications, exact alarms and battery: each shows as allowed, or with a button to fix it. */
@Composable
fun BackgroundChecklist(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val tick = rememberResumeTick()
    var refresh by remember { mutableStateOf(0) }
    val notifications = remember(tick, refresh) { Notifier.allowed(context) }
    val exact = remember(tick, refresh) { Scheduler.canScheduleExact(context) }
    val battery = remember(tick, refresh) { SystemAccess.batteryUnrestricted(context) }
    val askNotifications = rememberNotificationRequest { refresh++ }
    LaunchedRescheduleOnChange(exact)

    Column(modifier, verticalArrangement = Arrangement.spacedBy(14.dp)) {
        AccessRow(
            Icons.Rounded.Notifications, "Notifications",
            if (notifications) "Reminders and playback controls can be shown." else "Needed for reminders and lock-screen controls.",
            notifications, "Allow", askNotifications,
        )
        AccessRow(
            Icons.Rounded.AccessAlarm, "Alarms & reminders",
            if (exact) "Your mantra will start right on time." else "Needed to start the mantra exactly on time while the phone sleeps.",
            exact, "Allow",
        ) { SystemAccess.exactAlarms(context) }
        AccessRow(
            Icons.Rounded.BatteryChargingFull, "Battery optimization",
            if (battery) "Prabhat is not restricted." else "Choose “Unrestricted” / “Don't optimize” for Prabhat so the system never delays your session.",
            battery, "Adjust",
        ) { SystemAccess.battery(context) }
    }
}

@Composable
private fun LaunchedRescheduleOnChange(exact: Boolean) {
    val context = LocalContext.current
    androidx.compose.runtime.LaunchedEffect(exact) { Scheduler.reschedule(context) }
}

@Composable
private fun AccessRow(icon: ImageVector, title: String, text: String, ok: Boolean, action: String, onFix: () -> Unit) {
    val p = LocalPalette.current
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
        Icon(if (ok) Icons.Rounded.CheckCircle else icon, null, tint = p.gold, modifier = Modifier.size(24.dp))
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            Text(text, style = MaterialTheme.typography.bodySmall, color = p.muted)
        }
        if (!ok) {
            Spacer(Modifier.width(8.dp))
            FilledTonalButton(
                onClick = onFix,
                modifier = Modifier.padding(start = 4.dp),
                colors = ButtonDefaults.filledTonalButtonColors(containerColor = p.gold.copy(alpha = 0.18f), contentColor = if (p.dark) p.gold else p.text),
            ) { Text(action) }
        }
    }
}
