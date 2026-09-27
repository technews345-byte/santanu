package com.bowlmania.rider

import android.app.Application
import android.content.Context
import androidx.work.Configuration
import androidx.work.WorkManager
import coil.ImageLoader
import coil.request.CachePolicy
import com.bowlmania.rider.data.Connectivity
import com.bowlmania.rider.data.Prefs
import com.bowlmania.rider.data.Repository
import com.bowlmania.rider.data.SessionStore
import com.bowlmania.rider.data.db.AppDatabase
import com.bowlmania.rider.data.net.Network
import com.bowlmania.rider.location.RoutesClient
import com.bowlmania.rider.notify.Notifier
import com.bowlmania.rider.notify.Push

/** Everything the app shares, created once. */
class AppContainer(context: Context) {
    val app: Context = context.applicationContext
    val prefs = Prefs(context)
    val session = SessionStore(context)
    val network = Network { session.token }
    val db = AppDatabase.create(context)
    val repository = Repository(network.api, db, session)
    val connectivity = Connectivity(context)
    val routes = RoutesClient(context, network.client)
    /** Loads private images (profile photo) through the signed-in client; kept in memory only. */
    val images: ImageLoader = ImageLoader.Builder(context).okHttpClient(network.client)
        .diskCachePolicy(CachePolicy.DISABLED).crossfade(true).build()
}

class RiderApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        WorkManager.initialize(this, Configuration.Builder().setMinimumLoggingLevel(android.util.Log.ERROR).build())
        Notifier.createChannels(this)
        Push.init(this)
    }
}
