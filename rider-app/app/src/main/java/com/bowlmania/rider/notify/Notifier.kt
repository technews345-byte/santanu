package com.bowlmania.rider.notify

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.bowlmania.rider.MainActivity
import com.bowlmania.rider.R
import com.bowlmania.rider.data.SessionStore
import com.bowlmania.rider.data.net.RiderNotification

/** Builds every notification the app shows. Deliveries use a loud, lock-screen-visible channel. */
object Notifier {
    const val CH_DELIVERIES = "deliveries"
    const val CH_UPDATES = "updates"
    const val CH_TRACKING = "tracking"
    const val TRACKING_ID = 1

    fun createChannels(ctx: Context) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        val alarm = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        nm.createNotificationChannel(NotificationChannel(CH_DELIVERIES, ctx.getString(R.string.channel_deliveries), NotificationManager.IMPORTANCE_HIGH).apply {
            description = ctx.getString(R.string.channel_deliveries_desc)
            enableVibration(true); vibrationPattern = longArrayOf(0, 400, 200, 400, 200, 600)
            setSound(alarm, AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        })
        nm.createNotificationChannel(NotificationChannel(CH_UPDATES, ctx.getString(R.string.channel_updates), NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = ctx.getString(R.string.channel_updates_desc)
        })
        nm.createNotificationChannel(NotificationChannel(CH_TRACKING, ctx.getString(R.string.channel_tracking), NotificationManager.IMPORTANCE_LOW).apply {
            description = ctx.getString(R.string.channel_tracking_desc); setShowBadge(false)
        })
    }

    fun deepLink(ctx: Context, orderId: Int?, ticketId: Int? = null, tab: String? = null): PendingIntent {
        val uri = when {
            orderId != null -> Uri.parse("bowlmaniarider://order/$orderId")
            ticketId != null -> Uri.parse("bowlmaniarider://ticket/$ticketId")
            else -> Uri.parse("bowlmaniarider://tab/${tab ?: "notifications"}")
        }
        val i = Intent(Intent.ACTION_VIEW, uri, ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        return PendingIntent.getActivity(ctx, uri.hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun canPost(ctx: Context) = android.os.Build.VERSION.SDK_INT < 33 ||
        ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    /** Shows notifications newer than the last one shown, and remembers the newest id. */
    fun showNew(ctx: Context, list: List<RiderNotification>, session: SessionStore) {
        val fresh = list.filter { it.id > session.lastNotificationId && it.readAt == null }
        fresh.forEach { show(ctx, it) }
        list.maxOfOrNull { it.id }?.let { if (it > session.lastNotificationId) session.lastNotificationId = it }
    }

    fun show(ctx: Context, n: RiderNotification) {
        if (!canPost(ctx)) return
        val newDelivery = n.type == "new_delivery" && n.orderId != null
        val b = NotificationCompat.Builder(ctx, if (newDelivery || n.type == "order_cancelled") CH_DELIVERIES else CH_UPDATES)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(0xFF0B5D3B.toInt())
            .setContentTitle(if (newDelivery) "🔔 ${n.title}" else n.title)
            .setContentText(n.body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(n.body))
            .setAutoCancel(true)
            .setCategory(if (newDelivery) NotificationCompat.CATEGORY_CALL else NotificationCompat.CATEGORY_STATUS)
            .setPriority(if (newDelivery) NotificationCompat.PRIORITY_MAX else NotificationCompat.PRIORITY_DEFAULT)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(deepLink(ctx, n.orderId.takeIf { n.type != "order_reassigned" }, n.ticketId))
        if (newDelivery) {
            val id = n.orderId!!
            b.addAction(0, "Accept", NotificationActionReceiver.intent(ctx, NotificationActionReceiver.ACCEPT, id, n.id.toInt()))
            b.addAction(0, "Reject", NotificationActionReceiver.intent(ctx, NotificationActionReceiver.REJECT, id, n.id.toInt()))
            b.setTimeoutAfter(30 * 60_000)
        }
        try { NotificationManagerCompat.from(ctx).notify(n.id.toInt(), b.build()) } catch (_: SecurityException) { }
    }

    fun result(ctx: Context, notificationId: Int, title: String, text: String, orderId: Int?) {
        if (!canPost(ctx)) return
        val n = NotificationCompat.Builder(ctx, CH_UPDATES).setSmallIcon(R.drawable.ic_notification).setColor(0xFF0B5D3B.toInt())
            .setContentTitle(title).setContentText(text).setAutoCancel(true).setContentIntent(deepLink(ctx, orderId)).build()
        try { NotificationManagerCompat.from(ctx).notify(notificationId, n) } catch (_: SecurityException) { }
    }

    fun tracking(ctx: Context, onDelivery: Boolean, accuracy: Float?): Notification =
        NotificationCompat.Builder(ctx, CH_TRACKING)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(0xFF0B5D3B.toInt())
            .setContentTitle(if (onDelivery) "On a delivery · sharing location" else "Online · sharing location")
            .setContentText(accuracy?.let { "GPS accuracy about ${it.toInt()} m" } ?: "The kitchen can see where you are while you work.")
            .setOngoing(true).setOnlyAlertOnce(true).setSilent(true)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setContentIntent(deepLink(ctx, null, tab = "home"))
            .build()

    fun updateTracking(ctx: Context, onDelivery: Boolean, accuracy: Float?) {
        if (!canPost(ctx)) return
        try { NotificationManagerCompat.from(ctx).notify(TRACKING_ID, tracking(ctx, onDelivery, accuracy)) } catch (_: SecurityException) { }
    }
}
