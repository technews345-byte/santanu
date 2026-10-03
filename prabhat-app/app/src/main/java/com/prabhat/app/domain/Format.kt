package com.prabhat.app.domain

import com.prabhat.app.data.AppState
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.util.Locale

object Format {
    private val clock = DateTimeFormatter.ofPattern("hh:mm a", Locale.ENGLISH)

    fun time(hour: Int, minute: Int): String = LocalTime.of(hour, minute).format(clock)
    fun time(t: LocalTime): String = t.format(clock)

    /** 4:05 or 1:02:03. */
    fun duration(ms: Long): String {
        val total = (ms.coerceAtLeast(0) + 500) / 1000
        val h = total / 3600
        val m = (total % 3600) / 60
        val s = total % 60
        return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%d:%02d".format(m, s)
    }

    fun repeat(count: Int): String = when (count) {
        AppState.CONTINUOUS -> "Continuous"
        1 -> "Once"
        else -> "$count times"
    }

    fun fade(seconds: Int): String = if (seconds == 0) "Off" else "$seconds seconds"

    /** Greeting for the hour of the day. */
    fun greeting(hour: Int): Pair<String, String> = when (hour) {
        in 4..11 -> "Good Morning 🌅" to "Take a moment to breathe and begin."
        in 12..16 -> "Good Afternoon ☀️" to "Pause, breathe, return to calm."
        in 17..20 -> "Good Evening 🌇" to "Let the day settle gently."
        else -> "Peaceful Night 🌙" to "Rest well. Your morning is ready."
    }
}
