package com.prabhat.app.domain

import com.prabhat.app.data.ScheduleRule
import java.time.DayOfWeek
import java.time.Duration
import java.time.LocalTime
import java.time.ZonedDateTime

data class Occurrence(val at: ZonedDateTime, val rule: ScheduleRule)

/**
 * Schedule arithmetic in the device's time zone. Times are wall-clock times, so a 6:00 AM session stays at 6:00 AM
 * across daylight-saving changes and time-zone moves; a time skipped by a DST jump plays at the first valid moment after it.
 */
object ScheduleMath {
    private fun at(rule: ScheduleRule, day: ZonedDateTime): ZonedDateTime =
        ZonedDateTime.of(day.toLocalDate(), LocalTime.of(rule.hour, rule.minute), day.zone)

    private fun active(rules: List<ScheduleRule>) = rules.filter { it.enabled && it.days.isNotEmpty() }

    /** The first session strictly after [now], or null when nothing is scheduled. Rules at the same moment collapse to one. */
    fun next(rules: List<ScheduleRule>, now: ZonedDateTime): Occurrence? =
        active(rules).flatMap { rule ->
            (0..7).map { now.plusDays(it.toLong()) }
                .filter { it.dayOfWeek.value in rule.days }
                .map { Occurrence(at(rule, it), rule) }
                .filter { it.at.isAfter(now) }
                .take(1)
        }.minByOrNull { it.at.toInstant() }

    /** The latest session today that is due at or before [now], used for "Your mantra was scheduled for 6:00 AM". */
    fun lastToday(rules: List<ScheduleRule>, now: ZonedDateTime): Occurrence? =
        active(rules).filter { now.dayOfWeek.value in it.days }
            .map { Occurrence(at(it, now), it) }
            .filter { !it.at.isAfter(now) }
            .maxByOrNull { it.at.toInstant() }

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
