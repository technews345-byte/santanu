package com.bowlmania.rider

import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.bowlmania.rider.ui.AppRoot
import kotlinx.coroutines.flow.MutableStateFlow

class MainActivity : ComponentActivity() {
    /** The latest deep link (from a notification), consumed once the app has navigated to it. */
    private val links = MutableStateFlow<Uri?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        if (savedInstanceState == null) links.value = intent?.data
        addOnNewIntentListener { links.value = it.data }
        setContent { AppRoot(links) { links.value = null } }
    }
}
