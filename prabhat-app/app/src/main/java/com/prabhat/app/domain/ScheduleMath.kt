package com.prabhat.app.domain

import com.prabhat.app.data.Anchor
import com.prabhat.app.data.Place
import com.prabhat.app.data.ScheduleRule
import java.time.DayOfWeek
import java.time.Duration
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime

data class Occurrence(val at: ZonedDateTime, val rule: ScheduleRule)

/**
 * Schedule arithmetic in the device's time zone. Times are wall-clock times, so a 6:00 AM session stays at 6:00 AM
 * across daylight-saving changes and time-zone moves; a time skipped by a DST jump plays at the first valid moment after it.
 * Sunrise and sunset sessions follow the sun at [Place] day by day, and are skipped while no place is set.
 */
object ScheduleMath {
    /** When [rule] plays on [date], or null (sun-based without a place, or no sunrise/sunset that day). */
    fun timeOn(rule: ScheduleRule, date: LocalDate, zone: ZoneId, place: Place?): ZonedDateTime? = when (rule.anchor) {
        Anchor.TIME -> ZonedDateTime.of(date, LocalTime.of(rule.hour, rule.minute), zone)
        Anchor.SUNRISE, Anchor.SUNSET -> place?.let { Sun.times(date, it, zone) }
            ?.let { (rise, set) -> if (rule.anchor == Anchor.SUNRISE) rise else set }
            ?.plusMinutes(rule.offsetMinutes.toLong())
    }

    /** Minutes after midnight that [rule] plays today, for sorting (sun-based rules without a place go last). */
    fun minuteOfDay(rule: ScheduleRule, place: Place?, now: ZonedDateTime = ZonedDateTime.now()): Int =
        timeOn(rule, now.toLocalDate(), now.zone, place)?.let { it.hour * 60 + it.minute } ?: Int.MAX_VALUE

    private fun at(rule: ScheduleRule, day: ZonedDateTime, place: Place?) = timeOn(rule, day.toLocalDate(), day.zone, place)

    private fun active(rules: List<ScheduleRule>) = rules.filter { it.enabled && it.days.isNotEmpty() }

    /** The first session strictly after [now], or null when nothing is scheduled. Rules at the same moment collapse to one. */
    fun next(rules: List<ScheduleRule>, now: ZonedDateTime, place: Place? = null): Occurrence? =
        active(rules).flatMap { rule ->
            (0..7).map { now.plusDays(it.toLong()) }
                .filter { it.dayOfWeek.value in rule.days }
                .mapNotNull { day -> at(rule, day, place)?.let { Occurrence(it, rule) } }
                .filter { it.at.isAfter(now) }
                .take(1)
        }.minByOrNull { it.at.toInstant() }

    /** Today's sessions in time order, for the dashboard. */
    fun today(rules: List<ScheduleRule>, now: ZonedDateTime, place: Place? = null): List<Occurrence> =
        active(rules).filter { now.dayOfWeek.value in it.days }
            .mapNotNull { rule -> at(rule, now, place)?.let { Occurrence(it, rule) } }
            .sortedBy { it.at.toInstant() }

    /** The latest session today that is due at or before [now], used for "Your mantra was scheduled for 6:00 AM". */
    fun lastToday(rules: List<ScheduleRule>, now: ZonedDateTime, place: Place? = null): Occurrence? =
        today(rules, now, place).lastOrNull { !it.at.isAfter(now) }

    /**
     * Today's most recent session that is already due but not yet listened to, or null. A session counts as listened
     * to when any morning session finished after its time ([lastCompletedAt], epoch ms), so finishing the 6:30 mantra
     * does not hide a missed 7:00 one.
     */
    fun pendingToday(rules: List<ScheduleRule>, now: ZonedDateTime, lastCompletedAt: Long, place: Place? = null): Occurrence? =
        lastToday(rules, now, place)?.takeIf { lastCompletedAt < it.at.toInstant().toEpochMilli() }

    /** "06:30 AM", "Sunrise", "15 min before sunset". */
    fun label(rule: ScheduleRule): String {
        if (rule.anchor == Anchor.TIME) return Format.time(rule.hour, rule.minute)
        val sun = if (rule.anchor == Anchor.SUNRISE) "sunrise" else "sunset"
        val o = rule.offsetMinutes
        return when {
            o == 0 -> sun.replaceFirstChar { it.uppercase() }
            o < 0 -> "${-o} min before $sun"
            else -> "$o min after $sun"
        }
    }

    fun daysLabel(days: Set<Int>): String = when {
        days.size == 7 -> "Every day"
        days.isEmpty() -> "No days"
        days == setOf(1, 2, 3, 4, 5) -> "Monday–Friday"
        days == setOf(6, 7) -> "Weekends"
        days.size == 1 -> DayOfWeek.of(days.first()).name.lowercase().replaceFirstChar { it.uppercase() }
        else -> days.sorted().joinToString(", ") { DayOfWeek.of(it).name.take(3).lowercase().replaceFirstChar { c -> c.uppercase() } }
    }

    /** "8h 42m", "12m", "2d 3h", "less than a minute". */
    fun countdown(from: ZonedDateTime, to: ZonedDateTime): String {
        val d = Duration.between(from, to)
        val mins = (d.toMinutes() + if (d.seconds % 60 > 0) 1 else 0).coerceAtLeast(0)
        val days = mins / (24 * 60)
        val hours = (mins % (24 * 60)) / 60
        val m = mins % 60
        return when {
            mins == 0L -> "less than a minute"
            days > 0 -> if (hours > 0) "${days}d ${hours}h" else "${days}d"
            hours > 0 -> if (m > 0) "${hours}h ${m}m" else "${hours}h"
            else -> "${m}m"
        }
    }
}
