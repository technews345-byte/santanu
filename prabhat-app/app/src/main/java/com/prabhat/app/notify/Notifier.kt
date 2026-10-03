package com.prabhat.app.notify

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.prabhat.app.MainActivity
import com.prabhat.app.R

object Notifier {
    /** Shared with the Media3 notification provider so the playback notification uses this channel. */
    const val CHANNEL_PLAYBACK = "playback"
    const val CHANNEL_SESSIONS = "sessions"
    const val PLAYBACK_ID = 1001
    private const val REMINDER_ID = 2001
    private const val STATUS_ID = 2002

    const val EXTRA_PLAY_NOW = "play_now"

    fun ensureChannels(c: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        val nm = c.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_PLAYBACK, c.getString(R.string.channel_playback), NotificationManager.IMPORTANCE_LOW).apply {
                description = "Controls for the mantra that is playing"
                setShowBadge(false)
            }
        )
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_SESSIONS, c.getString(R.string.channel_sessions), NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "Reminders before your morning mantra, and when it starts or completes"
                setSound(null, null)
            }
        )
    }

    fun allowed(c: Context): Boolean =
        NotificationManagerCompat.from(c).areNotificationsEnabled() &&
            (Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(c, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED)

    fun openApp(c: Context, playNow: Boolean = false, request: Int = 0): PendingIntent =
        PendingIntent.getActivity(
            c, request,
            Intent(c, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                .putExtra(EXTRA_PLAY_NOW, playNow),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    private fun post(c: Context, id: Int, title: String, text: String, playAction: Boolean = false, timeoutMs: Long = 0) {
        if (!allowed(c)) return
        ensureChannels(c)
        val b = NotificationCompat.Builder(c, CHANNEL_SESSIONS)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(0xFFC9973F.toInt())
            .setContentTitle(title)
            .setContentText(text)
            .setContentIntent(openApp(c, playNow = playAction, request = id))
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
        if (playAction) b.addAction(0, "Play now", openApp(c, playNow = true, request = id + 100))
        if (timeoutMs > 0) b.setTimeoutAfter(timeoutMs)
        try {
            NotificationManagerCompat.from(c).notify(id, b.build())
        } catch (_: SecurityException) {
            // Notification permission was revoked between the check and the post.
        }
    }

    fun reminder(c: Context, minutes: Int, mantra: String) =
        post(c, REMINDER_ID, "Your morning mantra starts in $minutes minutes.", mantra, timeoutMs = minutes * 60_000L + 60_000)

    fun starting(c: Context, mantra: String) {
        NotificationManagerCompat.from(c).cancel(REMINDER_ID)
        post(c, STATUS_ID, "Your morning mantra is starting.", mantra, timeoutMs = 15 * 60_000L)
    }

    fun completed(c: Context, mantra: String) =
        post(c, STATUS_ID, "Morning session completed.", "$mantra · Have a peaceful day 🌅", timeoutMs = 6 * 60 * 60_000L)

    /** Shown when the phone was off or the app could not start playback in the background. */
    fun missed(c: Context, time: String, mantra: String) =
        post(c, STATUS_ID, "Good morning 🌅", "Your mantra was scheduled for $time. Tap to play $mantra.", playAction = true)

    fun cancelStatus(c: Context) = NotificationManagerCompat.from(c).cancel(STATUS_ID)

    /** A minimal placeholder used to enter the foreground immediately; the media notification replaces it. */
    fun preparing(c: Context, mantra: String) =
        NotificationCompat.Builder(c, CHANNEL_PLAYBACK)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(mantra)
            .setContentText("Starting your morning session…")
            .setContentIntent(openApp(c))
            .setSilent(true)
            .build()
}
