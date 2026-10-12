package com.prabhat.app

import android.app.Application
import com.prabhat.app.data.Library
import com.prabhat.app.data.Store
import com.prabhat.app.notify.Notifier
import com.prabhat.app.playback.PlayerConnection
import com.prabhat.app.schedule.Scheduler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

class PrabhatApp : Application() {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    lateinit var player: PlayerConnection
        private set

    override fun onCreate() {
        super.onCreate()
        Store.init(this)
        Notifier.ensureChannels(this)
        player = PlayerConnection(this, scope)
        scope.launch { Library.seed(this@PrabhatApp) }
        // Re-arm alarms whenever anything that affects the schedule changes, and once at every start.
        Scheduler.reschedule(this)
        scope.launch {
            Store.state.map { listOf(it.scheduleOn, it.schedules, it.notifyReminder, it.reminderLeadMinutes) }
                .distinctUntilChanged().drop(1)
                .collect { Scheduler.reschedule(this@PrabhatApp) }
        }
    }
}
