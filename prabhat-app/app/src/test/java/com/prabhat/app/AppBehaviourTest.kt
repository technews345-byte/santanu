package com.prabhat.app

import android.app.AlarmManager
import android.app.Application
import android.content.Intent
import android.os.Looper
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.prabhat.app.data.Ambience
import com.prabhat.app.data.AppState
import com.prabhat.app.data.Library
import com.prabhat.app.data.Mantra
import com.prabhat.app.data.Store
import com.prabhat.app.data.ThemeMode
import com.prabhat.app.domain.ScheduleMath
import com.prabhat.app.schedule.AlarmReceiver
import com.prabhat.app.schedule.Scheduler
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowAlarmManager
import java.io.File
import java.time.ZonedDateTime

@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
class AppBehaviourTest {
    private val app: Application = ApplicationProvider.getApplicationContext()

    @Before fun reset() {
        shadowOf(Looper.getMainLooper()).idle() // let the app's own start-up work finish first
        Store.init(app)
        Store.update { AppState() }
    }

    @Test fun `settings are saved to disk and read back after a restart`() {
        Store.update { it.copy(repeat = 54, ambience = Ambience.BELLS) }
        val file = File(app.filesDir, "prabhat.json")
        val deadline = System.currentTimeMillis() + 5_000
        while (!(file.exists() && file.readText().contains("\"repeat\":54"))) {
            check(System.currentTimeMillis() < deadline) { "settings were not saved" }
            Thread.sleep(20)
        }
        val back = Json { ignoreUnknownKeys = true }.decodeFromString(AppState.serializer(), file.readText())
        assertEquals(54, back.repeat)
        assertEquals(Ambience.BELLS, back.ambience)
    }

    @Test fun `built-in mantras are added once, deletions are kept, and the sunrise theme is switched on once`() = runBlocking {
        Store.update { AppState(theme = ThemeMode.SYSTEM) }
        Library.seed(app)
        var s = Store.value
        assertEquals(listOf(Library.BUNDLED_ID, "hanuman-chalisa", "krishna-mantra"), s.mantras.map { it.id })
        assertEquals(Library.BUNDLED_ID, s.defaultMantraId)
        assertEquals(listOf("morning", "hanuman"), s.schedules.map { it.id })
        assertEquals(ThemeMode.AUTO, s.theme)

        Library.delete("krishna-mantra")
        Store.update { it.copy(theme = ThemeMode.DARK) }
        Library.seed(app)
        s = Store.value
        assertFalse(s.mantras.any { it.id == "krishna-mantra" })
        assertEquals(ThemeMode.DARK, s.theme)
        assertEquals(2, s.mantras.size)
    }

    @Test fun `built-in audio is found by its current resource even when the saved reference is stale`() {
        val stale = Mantra(id = "hanuman-chalisa", name = "Hanuman Chalisa", file = "android.resource://${app.packageName}/123")
        assertEquals("android.resource://${app.packageName}/${R.raw.hanuman_chalisa}", Library.uri(app, stale).toString())
    }

    @Test fun `the next session is armed as an exact alarm clock at its time`() {
        ShadowAlarmManager.setCanScheduleExactAlarms(true)
        Scheduler.reschedule(app)
        val s = Store.value
        val expected = ScheduleMath.next(s.schedules, ZonedDateTime.now(), s.place)!!.at.toInstant().toEpochMilli()
        assertEquals(expected, app.getSystemService(AlarmManager::class.java).nextAlarmClock?.triggerTime)
    }

    @Test fun `a repeated alarm plays once, and one that is very late does not start playback`() {
        Store.update {
            it.copy(
                mantras = listOf(Mantra(id = Library.BUNDLED_ID, name = "Mahalakshmi Mantra", file = "android.resource://${app.packageName}/${R.raw.default_mantra}", builtIn = true)),
                defaultMantraId = Library.BUNDLED_ID,
            )
        }
        val shadow = shadowOf(app)
        shadow.clearStartedServices()
        val fire = Intent(app, AlarmReceiver::class.java).setAction(Scheduler.ACTION_FIRE)
            .putExtra(Scheduler.EXTRA_AT, System.currentTimeMillis() - 1_000).putExtra(Scheduler.EXTRA_RULE, "morning")

        AlarmReceiver().onReceive(app, fire)
        assertNotNull("the alarm starts playback", shadow.nextStartedService)
        AlarmReceiver().onReceive(app, fire)
        assertNull("the same alarm delivered again is ignored", shadow.nextStartedService)

        val late = Intent(fire).putExtra(Scheduler.EXTRA_AT, System.currentTimeMillis() - 60 * 60_000L)
        AlarmReceiver().onReceive(app, late)
        assertNull("an hour late: offer Play Now instead of surprise audio", shadow.nextStartedService)
    }
}
