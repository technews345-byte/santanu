package com.prabhat.app.playback

import android.content.ComponentName
import android.content.Context
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.guava.await
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

data class PlayerUi(
    val loaded: Boolean = false,
    val isPlaying: Boolean = false,
    val mantraId: String? = null,
    val positionMs: Long = 0,
    val durationMs: Long = 0,
)

/** The UI's connection to [PlaybackService], held while the app is visible. */
class PlayerConnection(private val context: Context, private val scope: CoroutineScope) {
    private var future: ListenableFuture<MediaController>? = null
    private var controller: MediaController? = null
    private var ticker: Job? = null
    private val _ui = MutableStateFlow(PlayerUi())
    val ui: StateFlow<PlayerUi> = _ui

    private val listener = object : Player.Listener {
        override fun onEvents(player: Player, events: Player.Events) = refresh()
    }

    fun connect() {
        if (future != null) return
        val f = MediaController.Builder(context, SessionToken(context, ComponentName(context, PlaybackService::class.java))).buildAsync()
        future = f
        scope.launch {
            val c = runCatching { f.await() }.getOrNull() ?: run { future = null; return@launch }
            controller = c
            c.addListener(listener)
            refresh()
        }
    }

    fun release() {
        ticker?.cancel()
        controller?.removeListener(listener)
        future?.let { MediaController.releaseFuture(it) }
        future = null
        controller = null
    }

    private suspend fun ready(): MediaController? {
        connect()
        return controller ?: runCatching { future?.await() }.getOrNull()
    }

    private fun refresh() {
        val c = controller ?: return
        _ui.value = PlayerUi(
            loaded = c.mediaItemCount > 0,
            isPlaying = c.isPlaying,
            mantraId = c.currentMediaItem?.mediaId,
            positionMs = c.currentPosition.coerceAtLeast(0),
            durationMs = c.duration.takeIf { it > 0 } ?: 0,
        )
        if (c.isPlaying && ticker?.isActive != true) {
            ticker = scope.launch { while (isActive) { delay(500); refresh() } }
        } else if (!c.isPlaying) {
            ticker?.cancel()
        }
    }

    /** Runs a command once the service is up (connecting starts it). */
    fun send(cmd: PlaybackHub.Command) {
        scope.launch {
            ready() ?: return@launch
            PlaybackHub.commands.send(cmd)
        }
    }

    fun play() = scope.launch { ready()?.play() }
    fun pause() = scope.launch { ready()?.pause() }
    fun seekTo(ms: Long) = scope.launch { ready()?.seekTo(ms); refresh() }
}
