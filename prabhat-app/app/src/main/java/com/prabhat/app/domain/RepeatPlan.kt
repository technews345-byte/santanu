package com.prabhat.app.domain

import com.prabhat.app.data.AppState

/**
 * Counts plays of the current mantra within a session. The player loops the track until the final play,
 * which then pauses at its end so the session finishes cleanly instead of moving to the next track.
 */
class RepeatPlan(var target: Int, var played: Int = 0) {
    /** True when the play in progress is the last one (never for continuous). */
    val isFinalPlay: Boolean get() = target != AppState.CONTINUOUS && played + 1 >= target

    fun onLoop() { played++ }
    fun reset() { played = 0 }

    /** "2 of 108", or null for a single play. */
    fun label(): String? = when (target) {
        1 -> null
        AppState.CONTINUOUS -> "Play ${played + 1} · continuous"
        else -> "${(played + 1).coerceAtMost(target)} of $target"
    }
}
