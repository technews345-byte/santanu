package com.prabhat.app.domain

import com.prabhat.app.data.AppState

/** The gentle start of a scheduled session. */
object Fade {
    /** The fade starts clearly audible, then rises evenly to full volume. */
    const val START_LEVEL = 0.25f

    fun level(progress: Float): Float = START_LEVEL + (1 - START_LEVEL) * progress.coerceIn(0f, 1f)

    /**
     * The fade length for a session: the setting, but never more than a third of the whole session, so a short
     * mantra is still heard at full volume. Unknown lengths and continuous sessions keep the setting.
     */
    fun seconds(setting: Int, trackMs: Long, plays: Int): Int {
        if (setting <= 0) return 0
        if (trackMs <= 0 || plays == AppState.CONTINUOUS) return setting
        val third = (trackMs * plays / 3_000).toInt()
        return setting.coerceAtMost(third.coerceAtLeast(1))
    }
}
