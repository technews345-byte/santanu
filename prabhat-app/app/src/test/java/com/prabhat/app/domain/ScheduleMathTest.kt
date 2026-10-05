package com.prabhat.app.domain

import com.prabhat.app.data.AppState
import com.prabhat.app.data.ScheduleRule
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZonedDateTime

class ScheduleMathTest {
    private val kolkata = ZoneId.of("Asia/Kolkata")
    private val newYork = ZoneId.of("America/New_York")
    private fun at(s: String, zone: ZoneId = kolkata) = ZonedDateTime.of(LocalDateTime.parse(s), zone)
    private val daily = ScheduleRule(id = "a") // 6:30 every day

    @Test fun `default morning time is 6 30 every day`() {
        assertEquals(6, daily.hour)
        assertEquals(30, daily.minute)
        assertEquals(7, daily.days.size)
    }

    @Test fun `next is later today when the time has not passed`() {
        val n = ScheduleMath.next(listOf(daily), at("2026-10-05T05:00"))!!
        assertEquals(at("2026-10-05T06:30"), n.at)
    }

    @Test fun `next is tomorrow once the time has passed or is now`() {
        assertEquals(at("2026-10-06T06:30"), ScheduleMath.next(listOf(daily), at("2026-10-05T06:30"))!!.at)
        assertEquals(at("2026-10-06T06:30"), ScheduleMath.next(listOf(daily), at("2026-10-05T09:00"))!!.at)
    }

    @Test fun `weekday rule skips the weekend`() {
        val weekdays = ScheduleRule(id = "w", hour = 6, minute = 30, days = setOf(1, 2, 3, 4, 5))
        // 2026-10-09 is a Friday.
        assertEquals(at("2026-10-12T06:30"), ScheduleMath.next(listOf(weekdays), at("2026-10-09T07:00"))!!.at)
    }

    @Test fun `earliest of several rules wins and disabled rules are ignored`() {
        val sunday = ScheduleRule(id = "s", hour = 7, minute = 0, days = setOf(7))
        val weekdays = ScheduleRule(id = "w", hour = 6, minute = 30, days = setOf(1, 2, 3, 4, 5))
        val off = ScheduleRule(id = "o", hour = 5, minute = 0, enabled = false)
        // Saturday evening: next is Sunday 7:00.
        val n = ScheduleMath.next(listOf(weekdays, sunday, off), at("2026-10-10T20:00"))!!
        assertEquals("s", n.rule.id)
        assertEquals(at("2026-10-11T07:00"), n.at)
    }

    @Test fun `no rules or no days means nothing scheduled`() {
        assertNull(ScheduleMath.next(emptyList(), at("2026-10-05T05:00")))
        assertNull(ScheduleMath.next(listOf(daily.copy(days = emptySet())), at("2026-10-05T05:00")))
    }

    @Test fun `wall clock time is kept across daylight saving`() {
        // US clocks fall back on 2026-11-01: 6:30 stays 6:30 local time.
        val n = ScheduleMath.next(listOf(daily), at("2026-10-31T23:00", newYork))!!
        assertEquals(LocalDateTime.parse("2026-11-01T06:30"), n.at.toLocalDateTime())
        // Spring forward on 2026-03-08 skips 2:00–3:00: a 2:30 session plays at 3:30 instead of being lost.
        val early = ScheduleRule(id = "e", hour = 2, minute = 30)
        val m = ScheduleMath.next(listOf(early), at("2026-03-08T01:00", newYork))!!
        assertEquals(LocalDateTime.parse("2026-03-08T03:30"), m.at.toLocalDateTime())
    }

    @Test fun `lastToday finds the session already due today`() {
        assertEquals(at("2026-10-05T06:30"), ScheduleMath.lastToday(listOf(daily), at("2026-10-05T08:00"))!!.at)
        assertNull(ScheduleMath.lastToday(listOf(daily), at("2026-10-05T06:00")))
    }

    @Test fun `labels and countdown`() {
        assertEquals("Every day", ScheduleMath.daysLabel(ScheduleRule.ALL_DAYS))
        assertEquals("Monday–Friday", ScheduleMath.daysLabel(setOf(1, 2, 3, 4, 5)))
        assertEquals("Sunday", ScheduleMath.daysLabel(setOf(7)))
        assertEquals("Mon, Wed, Fri", ScheduleMath.daysLabel(setOf(5, 1, 3)))
        assertEquals("8h 42m", ScheduleMath.countdown(at("2026-10-04T21:48"), at("2026-10-05T06:30")))
        assertEquals("12m", ScheduleMath.countdown(at("2026-10-05T06:18"), at("2026-10-05T06:30")))
        assertEquals("1m", ScheduleMath.countdown(at("2026-10-05T06:29:30"), at("2026-10-05T06:30")))
        assertEquals("2d 3h", ScheduleMath.countdown(at("2026-10-03T03:30"), at("2026-10-05T06:30")))
    }

    @Test fun `format helpers`() {
        assertEquals("06:30 AM", Format.time(6, 30))
        assertEquals("0:15", Format.duration(15_120))
        assertEquals("1:02:03", Format.duration(3_723_000))
        assertEquals("Once", Format.repeat(1))
        assertEquals("Continuous", Format.repeat(AppState.CONTINUOUS))
        assertEquals("108 times", Format.repeat(108))
    }

    @Test fun `repeat plan finishes on the final play`() {
        val three = RepeatPlan(3)
        assertFalse(three.isFinalPlay)
        three.onLoop(); assertFalse(three.isFinalPlay)
        three.onLoop(); assertTrue(three.isFinalPlay)
        assertEquals("3 of 3", three.label())
        assertTrue(RepeatPlan(1).isFinalPlay)
        val forever = RepeatPlan(AppState.CONTINUOUS)
        repeat(500) { forever.onLoop() }
        assertFalse(forever.isFinalPlay)
    }

    @Test fun `defaults match the mantra instructions`() {
        val s = AppState()
        assertEquals(3, s.repeat)
        assertEquals(20, s.fadeInSeconds)
        assertTrue(s.scheduleOn)
    }

    @Test fun `default mornings - mahalakshmi 6 30 three times, hanuman chalisa 7 00 once`() {
        val s = AppState()
        val (morning, hanuman) = s.schedules
        assertEquals(6 to 30, morning.hour to morning.minute)
        assertEquals(3, s.repeatFor(morning))
        assertEquals(7 to 0, hanuman.hour to hanuman.minute)
        assertEquals("hanuman-chalisa", hanuman.mantraId)
        assertEquals(7, hanuman.days.size)
        assertEquals(1, s.repeatFor(hanuman))
        // At 6:45 the next session is the Hanuman Chalisa at 7:00.
        val n = ScheduleMath.next(s.schedules, at("2026-10-05T06:45"))!!
        assertEquals("hanuman", n.rule.id)
    }
}
