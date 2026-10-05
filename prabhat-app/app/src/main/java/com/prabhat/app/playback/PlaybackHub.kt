package com.prabhat.app.playback

import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow

/** What started a session: only morning sessions count towards "today's session completed". */
enum class SessionKind { SCHEDULED, MORNING, MANUAL }

data class SessionInfo(val kind: SessionKind, val playLabel: String?)

/** A running sleep timer: either a fixed end time or "end of current mantra". */
data class SleepTimer(val endsAt: Long?, val endOfMantra: Boolean)

/** In-process link between the UI and [PlaybackService] for actions beyond the standard player controls. */
object PlaybackHub {
    sealed interface Command {
        /** [repeat] overrides the app's repeat setting for this session (a schedule's own count). */
        data class Start(val mantraId: String?, val kind: SessionKind, val resume: Boolean, val fade: Boolean, val repeat: Int? = null) : Command
        data class Skip(val delta: Int) : Command
        /** Minutes until playback pauses; [END_OF_MANTRA] or [CANCEL]. */
        data class Sleep(val minutes: Int) : Command
    }

    const val END_OF_MANTRA = -1
    const val CANCEL = 0
    val SLEEP_OPTIONS = listOf(5, 10, 15, 30, 45, 60, END_OF_MANTRA)

    val commands = Channel<Command>(Channel.UNLIMITED)
    val isPlaying = MutableStateFlow(false)
    val session = MutableStateFlow<SessionInfo?>(null)
    val sleep = MutableStateFlow<SleepTimer?>(null)
    val error = MutableStateFlow<String?>(null)
}
