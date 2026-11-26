package com.prabhat.app

import android.app.AlarmManager
import android.app.Application
import android.content.Intent
import android.os.Looper
import androidx.media3.exoplayer.ExoPlayer
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.prabhat.app.data.AppState
import com.prabhat.app.data.Library
import com.prabhat.app.data.Store
import com.prabhat.app.domain.Fade
import com.prabhat.app.playback.PlaybackService
import com.prabhat.app.schedule.AlarmReceiver
import com.prabhat.app.schedule.Scheduler
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowAlarmManager

/** The whole morning path on a fresh install: the alarm the app sets, its delivery, and the mantra playing aloud. */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
class MorningPlaybackTest {
    private val app: Application = ApplicationProvider.getApplicationContext()

    @Before fun freshInstall() = runBlocking {
        shadowOf(Looper.getMainLooper()).idle()
        Store.init(app)
        Store.update { AppState() }
        Library.seed(app)
        ShadowAlarmManager.setCanScheduleExactAlarms(true)
    }

    @Test fun `the morning alarm starts the mantra playing out loud`() {
        // 1. The app arms the next session as an alarm clock.
        Scheduler.reschedule(app)
        val delivered = shadowOf(app.getSystemService(AlarmManager::class.java)).scheduledAlarms
            .map { shadowOf(it.operation).savedIntent }
            .firstOrNull { it.action == Scheduler.ACTION_FIRE }
        assertNotNull("an alarm is set for the next session", delivered)

        // 2. At the time, the system delivers that alarm (here a moment after it was due).
        val at = delivered!!.getLongExtra(Scheduler.EXTRA_AT, 0)
        assertTrue(at > System.currentTimeMillis())
        val due = Intent(delivered).putExtra(Scheduler.EXTRA_AT, System.currentTimeMillis() - 1_000)
        shadowOf(app).clearStartedServices()
        AlarmReceiver().onReceive(app, due)

        // 3. It starts the playback service for the session's mantra.
        val start = shadowOf(app).nextStartedService
        assertNotNull("the alarm starts playback", start)
        assertEquals(PlaybackService.ACTION_SCHEDULED, start.action)
        val mantraId = start.getStringExtra(PlaybackService.EXTRA_MANTRA)
        val mantra = Store.value.mantra(mantraId)
        assertNotNull("the session has a mantra from the library", mantra)
        assertTrue("its audio is in the app", Library.isAvailable(mantra!!))

        // 4. The service comes to the foreground and plays that mantra, audibly from the first second.
        val service = Robolectric.buildService(PlaybackService::class.java, start).create().startCommand(0, 1).get()
        assertNotNull("shown as a media notification, so Android keeps it playing", shadowOf(service).lastForegroundNotification)
        val player = PlaybackService::class.java.getDeclaredField("player").apply { isAccessible = true }.get(service) as ExoPlayer
        assertTrue("playing", player.playWhenReady)
        assertEquals(mantraId, player.currentMediaItem?.mediaId)
        assertTrue("audible at once: volume ${player.volume}", player.volume >= Store.value.volume * Fade.START_LEVEL - 0.001f)

        // 5. The fade reaches full volume well within the session, even for the 15-second morning mantra.
        shadowOf(Looper.getMainLooper()).idleFor(java.time.Duration.ofSeconds(30))
        assertEquals(Store.value.volume, player.volume, 0.001f)
        service.onDestroy()
    }
}
