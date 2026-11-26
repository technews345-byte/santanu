package com.prabhat.app.domain

import com.prabhat.app.data.AppState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FadeTest {
    @Test fun startsAudibleAndEndsAtFullVolume() {
        assertTrue(Fade.level(0f) >= 0.25f)
        assertEquals(1f, Fade.level(1f), 0.0001f)
        assertTrue(Fade.level(0.5f) > Fade.level(0.1f))
    }

    @Test fun shortMantraFadesOverAThirdOfTheSession() {
        // A 15-second mantra played once is at full volume after 5 seconds, not silent for its whole length.
        assertEquals(5, Fade.seconds(setting = 120, trackMs = 15_000, plays = 1))
        assertEquals(15, Fade.seconds(120, 15_000, 3))
    }

    @Test fun longSessionKeepsTheSetting() =
        assertEquals(20, Fade.seconds(20, 257_000, 1))

    @Test fun offStaysOff() =
        assertEquals(0, Fade.seconds(0, 15_000, 3))

    @Test fun unknownLengthOrContinuousKeepsTheSetting() {
        assertEquals(30, Fade.seconds(30, 0, 3))
        assertEquals(30, Fade.seconds(30, 15_000, AppState.CONTINUOUS))
    }
}
