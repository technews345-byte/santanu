package com.prabhat.app

import android.app.Application
import android.os.Looper
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.prabhat.app.data.AppState
import com.prabhat.app.data.Library
import com.prabhat.app.data.ScheduleRule
import com.prabhat.app.data.Store
import com.prabhat.app.playback.PlayerConnection
import com.prabhat.app.ui.AppRoot
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.runBlocking
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/** Renders the real app and walks through its main screens. */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34], qualifiers = "w411dp-h891dp")
class ScreensTest {
    @get:Rule val compose = createComposeRule()
    private val app: Application = ApplicationProvider.getApplicationContext()

    @Before fun setUp() {
        shadowOf(Looper.getMainLooper()).idle()
        Store.init(app)
        Store.update { AppState() }
        runBlocking { Library.seed(app) }
        // One fixed session, so the screens show the Mahalakshmi Mantra whatever the time of the test.
        Store.update { it.copy(onboarded = true, schedules = listOf(ScheduleRule(id = "morning"))) }
    }

    private fun launch() = compose.setContent { AppRoot(PlayerConnection(app, MainScope()), MutableStateFlow(false)) {} }

    @Test fun `home shows today's sun in Jorhat, the next session and today's routine`() {
        launch()
        compose.onNodeWithText("Jorhat, Assam", substring = true).assertExists()
        compose.onNodeWithText("NEXT SESSION").assertExists()
        compose.onNodeWithText("TODAY'S ROUTINE").assertExists()
        compose.onNodeWithText("BEGIN YOUR PRACTICE").assertExists()
    }

    @Test fun `the player shows the japa count and the words with transliteration and meaning`() {
        launch()
        compose.onNodeWithText("BEGIN YOUR PRACTICE").performScrollTo().performClick()
        compose.onNodeWithText("Japa 1 of 3").assertExists()
        compose.onNodeWithText("Om Mahālakṣmī Namo Namaḥ").assertExists()
        compose.onNodeWithText("Salutations to Mahalakshmi, the great goddess of fortune.").assertExists()
        compose.onNodeWithContentDescription("Close player").performClick()
        compose.onNodeWithText("NEXT SESSION").assertExists()
    }

    @Test fun `a session can follow sunrise, showing today's time in Jorhat`() {
        launch()
        compose.onNodeWithText("Schedule").performClick()
        compose.onNodeWithText("Add another time", substring = true).performScrollTo().performClick()
        compose.onNodeWithText("Sunrise").performClick()
        compose.onNodeWithText("in Jorhat, Assam", substring = true).assertExists()
    }

    @Test fun `settings offer the theme, intro sound, 2-minute fade and japa vibration`() {
        launch()
        compose.onNodeWithText("Settings").performClick()
        compose.onNodeWithText("Sunrise & twilight").assertExists()
        compose.onNodeWithText("Temple bells").assertExists()
        compose.onNodeWithText("2 minutes").assertExists()
        compose.onNodeWithText("Vibrate on each japa").assertExists()
        compose.onAllNodesWithText("Sunrise and sunset times are for Jorhat, Assam.").onFirst().assertExists()
    }

    @Test fun `first launch starts with setup`() {
        Store.update { it.copy(onboarded = false) }
        launch()
        compose.onNodeWithText("Create Your Peaceful Morning").assertExists()
        compose.onNodeWithText("Begin").performClick()
        compose.onNodeWithText("Choose your mantra").assertExists()
    }
}
