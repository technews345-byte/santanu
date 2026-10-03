package com.prabhat.app.schedule

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.content.ContextCompat
import com.prabhat.app.data.Store
import com.prabhat.app.domain.Format
import com.prabhat.app.notify.Notifier
import com.prabhat.app.playback.PlaybackHub
import com.prabhat.app.playback.PlaybackService
import java.time.Instant
import java.time.ZoneId

/** Handles the morning alarm and its reminder. */
class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        Store.init(context)
        val at = intent.getLongExtra(Scheduler.EXTRA_AT, 0)
        val s = Store.value
        val rule = s.schedules.firstOrNull { it.id == intent.getStringExtra(Scheduler.EXTRA_RULE) }
        val mantra = s.mantraFor(rule)
        when (intent.action) {
            Scheduler.ACTION_REMIND -> {
                if (s.scheduleOn && s.notifyReminder && mantra != null && at > System.currentTimeMillis()) {
                    Notifier.reminder(context, s.reminderLeadMinutes, mantra.name)
                }
            }
            Scheduler.ACTION_FIRE -> {
                fire(context, at, mantra?.id, mantra?.name)
                Scheduler.reschedule(context)
            }
        }
    }

    private fun fire(context: Context, at: Long, mantraId: String?, mantraName: String?) {
        // The same alarm delivered twice (or re-armed for a time that already fired) plays only once.
        if (at != 0L && Store.value.lastFiredAt == at) return
        Store.update { it.copy(lastFiredAt = at) }
        if (!Store.value.scheduleOn || mantraId == null || mantraName == null) return
        // Never interrupt something the user is already listening to.
        if (PlaybackHub.isPlaying.value) return

        val time = Format.time(Instant.ofEpochMilli(at).atZone(ZoneId.systemDefault()).toLocalTime())
        if (System.currentTimeMillis() - at > LATE_LIMIT_MS) {
            // The phone was off or asleep far past the time: don't start playing out of nowhere.
            Notifier.missed(context, time, mantraName)
            return
        }
        try {
            ContextCompat.startForegroundService(
                context,
                Intent(context, PlaybackService::class.java)
                    .setAction(PlaybackService.ACTION_SCHEDULED)
                    .putExtra(PlaybackService.EXTRA_MANTRA, mantraId),
            )
            if (Store.value.notifyStart) Notifier.starting(context, mantraName)
        } catch (e: Exception) {
            // Android may refuse a background start (for example without exact-alarm access): offer a tap to play.
            Log.w("Prabhat", "Could not start playback from the alarm", e)
            Notifier.missed(context, time, mantraName)
        }
    }

    companion object {
        private const val LATE_LIMIT_MS = 30 * 60_000L
    }
}

/** Re-arms the schedule after a reboot, an update, or a clock / time-zone / permission change. */
class SystemEventsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        Store.init(context)
        Scheduler.reschedule(context)
    }
}
