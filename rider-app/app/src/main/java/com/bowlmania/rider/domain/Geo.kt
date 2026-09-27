package com.bowlmania.rider.domain

import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

object Geo {
    /** Straight-line distance in km. */
    fun haversineKm(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
        val r = 6371.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLng = Math.toRadians(lng2 - lng1)
        val a = sin(dLat / 2).let { it * it } + cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLng / 2).let { it * it }
        return 2 * r * asin(sqrt(a))
    }

    /** Road distance is usually longer than a straight line; used only when no routing service is configured. */
    const val ROAD_FACTOR = 1.3
    /** Typical two-wheeler speed in town traffic, km/h. */
    const val TOWN_SPEED_KMH = 22.0

    fun estimate(straightKm: Double): Estimate {
        val road = straightKm * ROAD_FACTOR
        return Estimate(road, ((road / TOWN_SPEED_KMH) * 60).roundToInt().coerceAtLeast(1), approximate = true)
    }

    fun validCoordinate(lat: Double?, lng: Double?): Boolean =
        lat != null && lng != null && lat in -90.0..90.0 && lng in -180.0..180.0 && !(lat == 0.0 && lng == 0.0)
}

/** Distance and time to a destination; [approximate] when calculated without a road route. */
data class Estimate(val km: Double, val minutes: Int, val approximate: Boolean) {
    val distanceText: String get() = (if (approximate) "≈ " else "") + if (km < 1) "${(km * 1000).roundToInt()} m" else String.format(Locale.US, "%.1f km", km)
    val timeText: String get() = (if (approximate) "≈ " else "") + if (minutes < 60) "$minutes min" else "${minutes / 60} h ${minutes % 60} min"
}

object Times {
    private val zone: ZoneId = ZoneId.of("Asia/Kolkata")
    private val sql = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")
    private val clock = DateTimeFormatter.ofPattern("h:mm a", Locale.ENGLISH)
    private val day = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH)
    private val dayShort = DateTimeFormatter.ofPattern("EEE, d MMM", Locale.ENGLISH)

    /** Server times are UTC, either "YYYY-MM-DD HH:MM:SS" (database) or ISO-8601. */
    fun parse(s: String?): Instant? = try {
        when {
            s.isNullOrBlank() -> null
            s.contains('T') -> Instant.parse(if (s.endsWith("Z") || s.contains('+')) s else s + "Z")
            else -> LocalDateTime.parse(s.take(19), sql).toInstant(ZoneOffset.UTC)
        }
    } catch (_: Exception) { null }

    fun clock(s: String?): String = parse(s)?.atZone(zone)?.format(clock) ?: "—"
    fun date(s: String?): String = parse(s)?.atZone(zone)?.format(day) ?: s?.let { runCatching { LocalDate.parse(it.take(10)).format(day) }.getOrNull() } ?: "—"
    fun dayLabel(ymd: String): String = runCatching {
        val d = LocalDate.parse(ymd)
        val today = LocalDate.now(zone)
        when (d) { today -> "Today"; today.plusDays(1) -> "Tomorrow"; else -> d.format(dayShort) }
    }.getOrDefault(ymd)
    fun today(): String = LocalDate.now(zone).toString()
    /** "10:00" (24 h) → "10:00 AM". */
    fun hhmm(t: String?): String = runCatching { java.time.LocalTime.parse(t).format(clock) }.getOrDefault(t ?: "—")
    fun hour(): Int = LocalDateTime.now(zone).hour
    fun ago(s: String?): String {
        val t = parse(s) ?: return ""
        val secs = Duration.between(t, Instant.now()).seconds
        return when {
            secs < 60 -> "just now"
            secs < 3600 -> "${secs / 60} min ago"
            secs < 86400 -> "${secs / 3600} h ago"
            else -> date(s)
        }
    }
    fun duration(seconds: Long): String {
        val h = seconds / 3600; val m = (seconds % 3600) / 60; val s = seconds % 60
        return if (h > 0) String.format(Locale.US, "%02d:%02d:%02d", h, m, s) else String.format(Locale.US, "%02d:%02d", m, s)
    }
}
