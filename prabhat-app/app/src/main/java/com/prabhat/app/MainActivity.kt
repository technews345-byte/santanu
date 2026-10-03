package com.prabhat.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.prabhat.app.notify.Notifier
import com.prabhat.app.ui.AppRoot
import kotlinx.coroutines.flow.MutableStateFlow

class MainActivity : ComponentActivity() {
    /** Set when opened from a "Play now" notification; consumed once the session has started. */
    private val playNow = MutableStateFlow(false)
    private val app get() = application as PrabhatApp

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        if (savedInstanceState == null) handle(intent)
        addOnNewIntentListener { handle(it) }
        setContent { AppRoot(app.player, playNow) { playNow.value = false } }
    }

    private fun handle(intent: Intent?) {
        if (intent?.getBooleanExtra(Notifier.EXTRA_PLAY_NOW, false) == true) {
            playNow.value = true
            Notifier.cancelStatus(this)
        }
    }

    override fun onStart() {
        super.onStart()
        app.player.connect()
    }

    override fun onStop() {
        app.player.release()
        super.onStop()
    }
}
