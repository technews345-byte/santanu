package com.bowlmania.rider.work

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.bowlmania.rider.RiderApp
import com.bowlmania.rider.data.net.AppError
import com.bowlmania.rider.notify.Notifier
import java.util.concurrent.TimeUnit

/** Uploads GPS points that were recorded while offline, as soon as there is a connection. */
class UploadWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val repo = (applicationContext as RiderApp).container.repository
        return repo.flushLocations().fold({ Result.success() }, { if (it is AppError.SessionExpired) Result.success() else Result.retry() })
    }
}

/** Background check for new assignments and messages when the tracking service isn't running (every 15 min). */
class SyncWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val c = (applicationContext as RiderApp).container
        if (!c.session.isSignedIn) return Result.success()
        c.repository.sync(c.session.lastNotificationId).onSuccess { Notifier.showNew(applicationContext, it.notifications, c.session) }
        return Result.success()
    }
}

object Workers {
    private val online = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

    fun uploadWhenOnline(ctx: Context) {
        WorkManager.getInstance(ctx).enqueueUniqueWork("upload-locations", ExistingWorkPolicy.KEEP,
            OneTimeWorkRequestBuilder<UploadWorker>().setConstraints(online).setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS).build())
    }
    fun schedulePeriodicSync(ctx: Context) {
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork("sync", ExistingPeriodicWorkPolicy.KEEP,
            PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES).setConstraints(online).build())
    }
    fun cancelAll(ctx: Context) = WorkManager.getInstance(ctx).cancelAllWork()
}
