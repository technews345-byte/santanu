package com.prabhat.app.schedule

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.prabhat.app.data.Store
import com.prabhat.app.domain.Occurrence
import com.prabhat.app.domain.ScheduleMath
import com.prabhat.app.notify.Notifier
import java.time.ZonedDateTime

/**
 * Arms one system alarm for the next session (and one for its reminder). The system keeps alarms while the app is
 * closed; they are re-armed after a reboot, an app update, a time or time-zone change, and after every session.
 */
object Scheduler {
    const val ACTION_FIRE = "com.prabhat.app.FIRE"
    const val ACTION_REMIND = "com.prabhat.app.REMIND"
    const val EXTRA_AT = "at"
    const val EXTRA_RULE = "rule"
    private const val REQ_FIRE = 1
    private const val REQ_REMIND = 2

    fun next(now: ZonedDateTime = ZonedDateTime.now()): Occurrence? {
        val s = Store.value
        return if (s.scheduleOn) ScheduleMath.next(s.schedules, now) else null
    }

    fun canScheduleExact(c: Context): Boolean =
        Build.VERSION.SDK_INT < 31 || c.getSystemService(AlarmManager::class.java).canScheduleExactAlarms()

    private fun pending(c: Context, action: String, req: Int, at: Long = 0, rule: String? = null, create: Boolean = true): PendingIntent? =
        PendingIntent.getBroadcast(
            c, req,
            Intent(c, AlarmReceiver::class.java).setAction(action).putExtra(EXTRA_AT, at).putExtra(EXTRA_RULE, rule),
            PendingIntent.FLAG_IMMUTABLE or if (create) PendingIntent.FLAG_UPDATE_CURRENT else PendingIntent.FLAG_NO_CREATE,
        )

    fun reschedule(c: Context) {
        val am = c.getSystemService(AlarmManager::class.java)
        pending(c, ACTION_FIRE, REQ_FIRE, create = false)?.let { am.cancel(it) }
        pending(c, ACTION_REMIND, REQ_REMIND, create = false)?.let { am.cancel(it) }

        val next = next() ?: return
        val at = next.at.toInstant().toEpochMilli()
        val fire = pending(c, ACTION_FIRE, REQ_FIRE, at, next.rule.id)!!
        try {
            if (canScheduleExact(c)) {
                // An alarm clock is exempt from Doze and shows in the status bar, like any wake-up alarm.
                am.setAlarmClock(AlarmManager.AlarmClockInfo(at, Notifier.openApp(c)), fire)
            } else {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, fire)
            }
        } catch (e: SecurityException) {
            Log.w("Prabhat", "Exact alarms not allowed, using an inexact alarm", e)
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, fire)
        }

        val s = Store.value
        val remindAt = at - s.reminderLeadMinutes * 60_000L
        if (s.notifyReminder && s.reminderLeadMinutes > 0 && remindAt > System.currentTimeMillis()) {
            val remind = pending(c, ACTION_REMIND, REQ_REMIND, at, next.rule.id)!!
            try {
                if (canScheduleExact(c)) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, remindAt, remind)
                else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, remindAt, remind)
            } catch (_: SecurityException) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, remindAt, remind)
            }
        }
    }
}
