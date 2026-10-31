package com.prabhat.app.domain

import com.prabhat.app.data.Place
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.acos
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.sin

/** Sunrise and sunset from the NOAA sunrise equation, computed on the phone (accurate to about a minute). */
object Sun {
    private fun rad(d: Double) = d * PI / 180
    private fun deg(r: Double) = r * 180 / PI

    /** Sunrise and sunset on [date] at [place] in [zone]; null when the sun does not rise or set that day (polar regions). */
    fun times(date: LocalDate, place: Place, zone: ZoneId): Pair<ZonedDateTime, ZonedDateTime>? {
        val n = date.toEpochDay() - 10957 + 0.0008                  // days since 1 Jan 2000, 12:00 UTC
        val jStar = n - place.lng / 360
        val m = (357.5291 + 0.98560028 * jStar).mod(360.0)
        val c = 1.9148 * sin(rad(m)) + 0.02 * sin(rad(2 * m)) + 0.0003 * sin(rad(3 * m))
        val lambda = (m + c + 180 + 102.9372).mod(360.0)
        val transit = 2451545.0 + jStar + 0.0053 * sin(rad(m)) - 0.0069 * sin(rad(2 * lambda))
        val decl = asin(sin(rad(lambda)) * sin(rad(23.4397)))
        val cosW = (sin(rad(-0.833)) - sin(rad(place.lat)) * sin(decl)) / (cos(rad(place.lat)) * cos(decl))
        if (abs(cosW) > 1) return null
        val w = deg(acos(cosW)) / 360
        fun at(julian: Double) = Instant.ofEpochMilli(((julian - 2440587.5) * 86_400_000).toLong()).atZone(zone)
        return at(transit - w) to at(transit + w)
    }
}
