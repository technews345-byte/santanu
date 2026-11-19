package com.prabhat.app.data

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ResumePointTest {
    private val now = 1_000_000_000L
    private val minute = 60_000L
    private fun point(positionMs: Long = 5_000, played: Int = 0, savedAt: Long = now - minute) =
        ResumePoint("om", positionMs, played, savedAt)

    @Test fun recentPauseOfSameMantraResumes() =
        assertTrue(point().usableFor("om", target = 3, durationMs = 15_000, now = now))

    @Test fun otherMantraStartsFresh() =
        assertFalse(point().usableFor("krishna", 3, 15_000, now))

    @Test fun pauseOlderThanHalfAnHourStartsFresh() =
        assertFalse(point(savedAt = now - 31 * minute).usableFor("om", 3, 15_000, now))

    @Test fun pointSavedBeforeTimesWereKeptStartsFresh() =
        assertFalse(point(savedAt = 0).usableFor("om", 3, 15_000, now))

    @Test fun pointFromTheFutureStartsFresh() =
        assertFalse(point(savedAt = now + minute).usableFor("om", 3, 15_000, now))

    @Test fun lastSecondsOfTrackStartFresh() =
        assertFalse(point(positionMs = 12_500, played = 2).usableFor("om", 3, 15_000, now))

    @Test fun noPlaysLeftStartsFresh() =
        assertFalse(point(played = 3).usableFor("om", 1, 15_000, now))

    @Test fun continuousSessionResumesAfterManyPlays() =
        assertTrue(point(played = 200).usableFor("om", AppState.CONTINUOUS, 15_000, now))

    @Test fun unknownDurationStillResumes() =
        assertTrue(point(positionMs = 60_000).usableFor("om", 3, 0, now))
}
