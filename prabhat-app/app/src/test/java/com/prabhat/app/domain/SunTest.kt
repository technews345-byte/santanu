package com.prabhat.app.domain

import com.prabhat.app.data.Anchor
import com.prabhat.app.data.Place
import com.prabhat.app.data.ScheduleRule
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Duration
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime

class SunTest {
    private val kolkata = ZoneId.of("Asia/Kolkata")
    private val jamshedpur = Place(22.80, 86.18)

    private fun near(expected: String, actual: ZonedDateTime, minutes: Long = 3) =
        assertTrue("expected ~$expected, got ${actual.toLocalTime()}",
            Duration.between(LocalTime.parse(expected), actual.toLocalTime()).abs() <= Duration.ofMinutes(minutes))

    @Test fun `sunrise and sunset match published times`() {
        // London, midsummer 2026: sunrise 04:43, sunset 21:21 (BST).
        val (rise, set) = Sun.times(LocalDate.of(2026, 6, 21), Place(51.5074, -0.1278), ZoneId.of("Europe/London"))!!
        near("04:43", rise); near("21:21", set)
        // Kolkata, 31 Oct 2026: 05:41 and 17:02 IST. Jamshedpur, 2° further west, is about 9 minutes later.
        val (r2, s2) = Sun.times(LocalDate.of(2026, 10, 31), Place(22.5726, 88.3639), kolkata)!!
        near("05:41", r2); near("17:02", s2)
        near("05:50", Sun.times(LocalDate.of(2026, 10, 31), jamshedpur, kolkata)!!.first)
    }

    @Test fun `jorhat is the default place, with sunrise before 5 30 and sunset before 5 PM in late October`() {
        val s = com.prabhat.app.data.AppState()
        assertEquals(com.prabhat.app.data.Place.JORHAT, s.place)
        val (rise, set) = Sun.times(LocalDate.of(2026, 10, 31), s.place!!, kolkata)!!
        println("Jorhat 31 Oct 2026: sunrise ${rise.toLocalTime()}, sunset ${set.toLocalTime()}")
        // Guwahati (2.5° west) rises about 05:29 and sets about 16:44 now; Jorhat is ~10 minutes earlier.
        near("05:19", rise, 5); near("16:34", set, 5)
    }

    @Test fun `no sunrise in polar night`() {
        assertNull(Sun.times(LocalDate.of(2026, 12, 21), Place(78.22, 15.65), ZoneId.of("Arctic/Longyearbyen")))
    }

    @Test fun `sun-anchored schedules follow the sun with an offset, and wait for a place`() {
        val rule = ScheduleRule(id = "dawn", anchor = Anchor.SUNRISE, offsetMinutes = -15)
        val now = ZonedDateTime.of(LocalDateTime.parse("2026-10-31T03:00"), kolkata)
        assertNull(ScheduleMath.next(listOf(rule), now))           // no place yet
        val n = ScheduleMath.next(listOf(rule), now, jamshedpur)!!
        near("05:35", n.at)
        assertEquals("15 min before sunrise", ScheduleMath.label(rule))
        assertEquals("Sunset", ScheduleMath.label(rule.copy(anchor = Anchor.SUNSET, offsetMinutes = 0)))
        // Clock-time rules are unaffected by the place.
        val today = ScheduleMath.today(listOf(rule, ScheduleRule(id = "a")), now, jamshedpur)
        assertEquals(listOf("dawn", "a"), today.map { it.rule.id })
    }
}
