package com.bowlmania.rider.location

import android.annotation.SuppressLint
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.os.Build
import android.os.IBinder
import android.os.Looper
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.bowlmania.rider.RiderApp
import com.bowlmania.rider.data.db.QueuedLocation
import com.bowlmania.rider.notify.Notifier
import com.bowlmania.rider.work.Workers
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Shares the rider's location with the kitchen while they are online or on a delivery, as a visible
 * foreground service (Android requires this for location while the screen is off). It also checks for
 * new assignments every 30 seconds, so riders are alerted even without Firebase push.
 * It stops by itself when the rider goes offline with no active delivery.
 */
class TrackingService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val container by lazy { (application as RiderApp).container }
    private val fused by lazy { LocationServices.getFusedLocationProviderClient(this) }
    @Volatile private var activeOrderId: Int? = null
    @Volatile private var mode: Mode? = null
    private var loopStarted = false

    private enum class Mode(val priority: Int, val intervalMs: Long, val minMeters: Float) {
        DELIVERY(Priority.PRIORITY_HIGH_ACCURACY, 10_000, 10f),
        WAITING(Priority.PRIORITY_BALANCED_POWER_ACCURACY, 30_000, 25f),
    }

    private val callback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            val points = result.locations.filter { it.accuracy <= 100f }
            if (points.isEmpty()) return
            scope.launch { points.forEach { container.repository.queueLocation(it.toQueued(activeOrderId)) } }
            Notifier.updateTracking(this@TrackingService, activeOrderId != null, points.last().accuracy)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!Locations.hasPermission(this) || !container.session.isSignedIn) { stopSelf(); return START_NOT_STICKY }
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION else 0
        try {
            ServiceCompat.startForeground(this, Notifier.TRACKING_ID, Notifier.tracking(this, activeOrderId != null, null), type)
        } catch (e: Exception) {
            // Android may refuse a location service started from the background; the app retries when opened.
            stopSelf(); return START_NOT_STICKY
        }
        intent?.getIntExtra(EXTRA_ORDER, -1)?.takeIf { it > 0 }?.let { activeOrderId = it }
        applyMode(if (activeOrderId != null) Mode.DELIVERY else Mode.WAITING)
        if (!loopStarted) { loopStarted = true; scope.launch { loop() } }
        return START_STICKY
    }

    @SuppressLint("MissingPermission")
    private fun applyMode(next: Mode) {
        if (mode == next) return
        mode = next
        fused.removeLocationUpdates(callback)
        val req = LocationRequest.Builder(next.priority, next.intervalMs).setMinUpdateDistanceMeters(next.minMeters).setWaitForAccurateLocation(false).build()
        try { fused.requestLocationUpdates(req, callback, Looper.getMainLooper()) } catch (_: SecurityException) { stopSelf() }
    }

    private suspend fun loop() {
        val repo = container.repository
        val session = container.session
        while (scope.isActive) {
            val keepGoing = repo.flushLocations().getOrElse { Workers.uploadWhenOnline(this); true }
            if (!keepGoing) { stopSelf(); return }
            repo.sync(session.lastNotificationId).onSuccess { s ->
                Notifier.showNew(this, s.notifications, session)
                activeOrderId = s.activeOrderId
                applyModeOnMain(if (s.activeOrderId != null) Mode.DELIVERY else Mode.WAITING)
                Notifier.updateTracking(this, s.activeOrderId != null, null)
                if (!s.tracking) { repo.flushLocations(); stopSelf(); return }
            }
            delay(30_000)
        }
    }
    private fun applyModeOnMain(m: Mode) = ContextCompat.getMainExecutor(this).execute { applyMode(m) }

    override fun onDestroy() {
        fused.removeLocationUpdates(callback)
        scope.cancel()
        super.onDestroy()
    }

    companion object {
        private const val EXTRA_ORDER = "order_id"
        /** Starts (or updates) tracking. Must be called while the app is in the foreground. */
        fun start(ctx: Context, activeOrderId: Int? = null) {
            if (!Locations.hasPermission(ctx)) return
            val i = Intent(ctx, TrackingService::class.java).putExtra(EXTRA_ORDER, activeOrderId ?: -1)
            runCatching { ContextCompat.startForegroundService(ctx, i) }
        }
        fun stop(ctx: Context) { ctx.stopService(Intent(ctx, TrackingService::class.java)) }
    }
}

private fun Location.toQueued(orderId: Int?) = QueuedLocation(
    lat = latitude, lng = longitude, accuracy = if (hasAccuracy()) accuracy else null, speed = if (hasSpeed()) speed else null,
    heading = if (hasBearing()) bearing else null, timestamp = time, orderId = orderId,
)
