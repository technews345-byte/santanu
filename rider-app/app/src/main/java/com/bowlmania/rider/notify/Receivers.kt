package com.bowlmania.rider.notify

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationManagerCompat
import com.bowlmania.rider.BuildConfig
import com.bowlmania.rider.RiderApp
import com.bowlmania.rider.data.Repository
import com.bowlmania.rider.data.net.RiderNotification
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

/** Accept / Reject straight from the new-delivery notification. The server confirms before anything changes. */
class NotificationActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val orderId = intent.getIntExtra(EXTRA_ORDER, -1).takeIf { it > 0 } ?: return
        val notifId = intent.getIntExtra(EXTRA_NOTIF, 0)
        val action = intent.action ?: return
        val repo = (context.applicationContext as RiderApp).container.repository
        NotificationManagerCompat.from(context).cancel(notifId)
        val pending = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                if (action == ACCEPT) {
                    repo.accept(orderId, Repository.newKey(), null, null).fold(
                        { Notifier.result(context, notifId, "Delivery ${it.orderNumber} accepted", "Open the order to start.", orderId) },
                        { Notifier.result(context, notifId, "Couldn't accept the delivery", it.message ?: "Open the app and try again.", orderId) },
                    )
                } else {
                    repo.reject(orderId, "Rejected from notification").fold(
                        { Notifier.result(context, notifId, "Delivery rejected", "The kitchen will assign someone else.", null) },
                        { Notifier.result(context, notifId, "Couldn't reject the delivery", it.message ?: "Open the app and try again.", orderId) },
                    )
                }
            } finally { pending.finish() }
        }
    }

    companion object {
        const val ACCEPT = "com.bowlmania.rider.ACCEPT"
        const val REJECT = "com.bowlmania.rider.REJECT"
        private const val EXTRA_ORDER = "order_id"
        private const val EXTRA_NOTIF = "notification_id"
        fun intent(ctx: Context, action: String, orderId: Int, notificationId: Int): PendingIntent = PendingIntent.getBroadcast(
            ctx, (action + orderId).hashCode(),
            Intent(ctx, NotificationActionReceiver::class.java).setAction(action).putExtra(EXTRA_ORDER, orderId).putExtra(EXTRA_NOTIF, notificationId),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }
}

/**
 * Firebase Cloud Messaging, only active when the build has Firebase settings. Messages are data-only,
 * so the app builds the notification itself (with Accept / Reject for new deliveries).
 */
class PushService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        val repo = (application as RiderApp).container.repository
        CoroutineScope(Dispatchers.IO).launch { repo.registerPushToken(token) }
    }
    override fun onMessageReceived(message: RemoteMessage) {
        val d = message.data
        val id = d["id"]?.toLongOrNull() ?: return
        val session = (application as RiderApp).container.session
        if (!session.isSignedIn) return
        val n = RiderNotification(id, d["type"] ?: "system", d["title"] ?: "Bowl Mania", d["body"] ?: "", d["order_id"]?.toIntOrNull(), d["ticket_id"]?.toIntOrNull(), null, "")
        Notifier.showNew(this, listOf(n), session)
    }
}

object Push {
    val configured: Boolean get() = BuildConfig.FIREBASE_APP_ID.isNotBlank() && BuildConfig.FIREBASE_PROJECT_ID.isNotBlank()

    fun init(ctx: Context) {
        if (!configured || FirebaseApp.getApps(ctx).isNotEmpty()) return
        FirebaseApp.initializeApp(ctx, FirebaseOptions.Builder()
            .setApplicationId(BuildConfig.FIREBASE_APP_ID).setApiKey(BuildConfig.FIREBASE_API_KEY)
            .setProjectId(BuildConfig.FIREBASE_PROJECT_ID).setGcmSenderId(BuildConfig.FIREBASE_SENDER_ID).build())
    }

    /** Registers this phone for push after sign-in. Silently does nothing when Firebase isn't configured. */
    suspend fun register(repo: Repository) {
        if (!configured) return
        runCatching { FirebaseMessaging.getInstance().token.await() }.getOrNull()?.let { repo.registerPushToken(it) }
    }
}
