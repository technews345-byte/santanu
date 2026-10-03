package com.prabhat.app.playback

import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import androidx.annotation.OptIn
import androidx.core.app.ServiceCompat
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.DefaultMediaNotificationProvider
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import com.prabhat.app.R
import com.prabhat.app.data.Library
import com.prabhat.app.data.Mantra
import com.prabhat.app.data.ResumePoint
import com.prabhat.app.data.Store
import com.prabhat.app.domain.RepeatPlan
import com.prabhat.app.notify.Notifier
import com.prabhat.app.schedule.Scheduler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.io.File
import java.time.LocalDate

/**
 * Plays mantras in the background with lock-screen, notification, Bluetooth and headphone controls.
 * ExoPlayer handles audio focus (pausing for calls and other apps, resuming after short interruptions)
 * and pauses when headphones are unplugged.
 *
 * The queue is the whole library, so Previous / Next move between mantras. Each mantra loops until the
 * session's repeat count is reached; the last play then pauses at its end, which completes the session.
 */
@OptIn(UnstableApi::class)
class PlaybackService : MediaSessionService() {
    private lateinit var player: ExoPlayer
    private lateinit var session: MediaSession
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var plan = RepeatPlan(1)
    private var kind = SessionKind.MANUAL
    private var sleepAtEnd = false
    private var fadeJob: Job? = null
    private var sleepJob: Job? = null

    override fun onCreate() {
        super.onCreate()
        Store.init(this)
        Notifier.ensureChannels(this)
        player = ExoPlayer.Builder(this)
            .setAudioAttributes(
                AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(),
                /* handleAudioFocus = */ true,
            )
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_LOCAL)
            .build()
        player.addListener(listener)
        session = MediaSession.Builder(this, player).setSessionActivity(Notifier.openApp(this)).build()
        setMediaNotificationProvider(
            DefaultMediaNotificationProvider.Builder(this)
                .setChannelId(Notifier.CHANNEL_PLAYBACK)
                .setChannelName(R.string.channel_playback)
                .setNotificationId(Notifier.PLAYBACK_ID)
                .build()
                .apply { setSmallIcon(R.drawable.ic_notification) }
        )
        addSession(session)

        scope.launch { for (cmd in PlaybackHub.commands) handle(cmd) }
        scope.launch {
            Store.state.map { it.volume }.distinctUntilChanged().collect { v -> if (fadeJob?.isActive != true) player.volume = v }
        }
        scope.launch {
            Store.state.map { it.repeat }.distinctUntilChanged().collect { plan.target = it; applyRepeat() }
        }
        // Save the position now and then, so it survives the process being stopped mid-session.
        scope.launch {
            while (isActive) { delay(15_000); if (player.isPlaying) saveResume() }
        }
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession = session

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_SCHEDULED) {
            val mantraId = intent.getStringExtra(EXTRA_MANTRA)
            // Started with startForegroundService: enter the foreground at once; the media notification replaces this.
            ServiceCompat.startForeground(
                this, Notifier.PLAYBACK_ID,
                Notifier.preparing(this, Store.value.mantra(mantraId)?.name ?: "Morning mantra"),
                if (Build.VERSION.SDK_INT >= 29) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK else 0,
            )
            if (!start(mantraId, SessionKind.SCHEDULED, resume = false, fade = true)) {
                ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
            return START_NOT_STICKY
        }
        return super.onStartCommand(intent, flags, startId)
    }

    private fun handle(cmd: PlaybackHub.Command) {
        when (cmd) {
            is PlaybackHub.Command.Start -> start(cmd.mantraId, cmd.kind, cmd.resume, cmd.fade)
            is PlaybackHub.Command.Skip -> {
                val count = player.mediaItemCount
                if (count > 0) {
                    player.seekTo(Math.floorMod(player.currentMediaItemIndex + cmd.delta, count), 0)
                    plan.reset(); applyRepeat()
                    if (!player.playWhenReady) player.play()
                }
            }
            is PlaybackHub.Command.Sleep -> setSleep(cmd.minutes)
        }
    }

    private fun mediaItem(m: Mantra): MediaItem {
        val art = m.cover?.let { Uri.fromFile(File(it)) }
            ?: Uri.parse("android.resource://$packageName/${R.drawable.prabhat_art}")
        return MediaItem.Builder()
            .setMediaId(m.id)
            .setUri(Library.uri(this, m))
            .setMediaMetadata(
                MediaMetadata.Builder().setTitle(m.name).setArtist(getString(R.string.app_name)).setArtworkUri(art).build()
            )
            .build()
    }

    /** Starts a session with [mantraId] (or the default). Returns false when nothing in the library can be played. */
    private fun start(mantraId: String?, kind: SessionKind, resume: Boolean, fade: Boolean): Boolean {
        val s = Store.value
        val playable = s.mantras.filter { Library.isAvailable(it) }
        if (playable.isEmpty()) {
            PlaybackHub.error.value = "No playable mantra found. Add one in the Mantras tab."
            return false
        }
        val wanted = s.mantra(mantraId) ?: s.defaultMantra
        if (wanted != null && !Library.isAvailable(wanted)) {
            PlaybackHub.error.value = "“${wanted.name}” is missing from storage, playing another mantra instead."
        }
        val index = playable.indexOfFirst { it.id == wanted?.id }.coerceAtLeast(0)
        val point = s.resume?.takeIf { resume && it.mantraId == playable[index].id }

        this.kind = kind
        plan = RepeatPlan(s.repeat, point?.played ?: 0)
        clearSleep()
        player.setMediaItems(playable.map(::mediaItem), index, point?.positionMs ?: 0L)
        applyRepeat()
        fadeJob?.cancel()
        player.volume = if (fade && s.fadeInSeconds > 0) 0f else s.volume
        player.prepare()
        player.play()
        if (fade && s.fadeInSeconds > 0) fadeIn(s.fadeInSeconds)
        publishSession()
        return true
    }

    /** Loop the current mantra, except on the final play of the session (or before an end-of-mantra sleep). */
    private fun applyRepeat() {
        if (!::player.isInitialized) return
        val last = plan.isFinalPlay || sleepAtEnd
        player.repeatMode = if (last) Player.REPEAT_MODE_OFF else Player.REPEAT_MODE_ONE
        player.pauseAtEndOfMediaItems = last
        publishSession()
    }

    private fun publishSession() {
        PlaybackHub.session.value = if (player.mediaItemCount > 0) SessionInfo(kind, plan.label()) else null
    }

    private fun fadeIn(seconds: Int) {
        fadeJob = scope.launch {
            val steps = seconds * 10
            for (i in 1..steps) {
                delay(100)
                val f = i.toFloat() / steps
                player.volume = Store.value.volume * f * f // eased so the start is especially soft
            }
            player.volume = Store.value.volume
        }
    }

    private fun setSleep(minutes: Int) {
        clearSleep()
        when {
            minutes == PlaybackHub.END_OF_MANTRA -> {
                sleepAtEnd = true
                PlaybackHub.sleep.value = SleepTimer(null, endOfMantra = true)
                applyRepeat()
            }
            minutes > 0 -> {
                val endsAt = System.currentTimeMillis() + minutes * 60_000L
                PlaybackHub.sleep.value = SleepTimer(endsAt, endOfMantra = false)
                sleepJob = scope.launch {
                    delay(minutes * 60_000L - FADE_OUT_MS)
                    fadeJob?.cancel()
                    val from = player.volume
                    for (i in 1..40) { delay(FADE_OUT_MS / 40); player.volume = from * (1 - i / 40f) }
                    player.pause()
                    player.volume = Store.value.volume
                    PlaybackHub.sleep.value = null
                }
            }
        }
    }

    private fun clearSleep() {
        sleepJob?.cancel()
        sleepJob = null
        val wasEnd = sleepAtEnd
        sleepAtEnd = false
        PlaybackHub.sleep.value = null
        if (wasEnd) applyRepeat()
    }

    /** The last play reached its end (or the end-of-mantra sleep timer fired). */
    private fun onFinished() {
        val completed = plan.isFinalPlay
        if (sleepAtEnd) clearSleep()
        if (completed && kind != SessionKind.MANUAL) {
            Store.update { it.copy(completedOn = LocalDate.now().toString()) }
            if (Store.value.notifyComplete) {
                Notifier.completed(this, player.currentMediaItem?.mediaMetadata?.title?.toString() ?: "Morning mantra")
            }
        }
        // Rewind so Play starts the mantra again from the beginning.
        plan.reset()
        player.pause()
        player.seekTo(player.currentMediaItemIndex, 0)
        applyRepeat()
        Store.update { it.copy(resume = null) }
        Scheduler.reschedule(this)
    }

    private fun saveResume() {
        val id = player.currentMediaItem?.mediaId ?: return
        Store.update { it.copy(resume = ResumePoint(id, player.currentPosition, plan.played)) }
    }

    private val listener = object : Player.Listener {
        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            when (reason) {
                Player.MEDIA_ITEM_TRANSITION_REASON_REPEAT -> plan.onLoop()
                Player.MEDIA_ITEM_TRANSITION_REASON_PLAYLIST_CHANGED -> Unit
                else -> plan.reset() // the user moved to another mantra
            }
            applyRepeat()
        }

        override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
            if (!playWhenReady && reason == Player.PLAY_WHEN_READY_CHANGE_REASON_END_OF_MEDIA_ITEM) onFinished()
        }

        override fun onPlaybackStateChanged(playbackState: Int) {
            if (playbackState == Player.STATE_ENDED) onFinished()
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            PlaybackHub.isPlaying.value = isPlaying
            if (isPlaying) {
                PlaybackHub.error.value = null
            } else if (player.playbackState == Player.STATE_READY) {
                saveResume()
            }
        }

        override fun onPlayerError(error: PlaybackException) {
            PlaybackHub.error.value = "This mantra could not be played. The file may be damaged or unsupported."
            PlaybackHub.isPlaying.value = false
            if (!player.playWhenReady || player.mediaItemCount <= 1) {
                ServiceCompat.stopForeground(this@PlaybackService, ServiceCompat.STOP_FOREGROUND_REMOVE)
            } else {
                // Try the next mantra rather than leaving the morning silent.
                player.seekToNextMediaItem()
                player.prepare()
            }
        }
    }

    override fun onDestroy() {
        if (player.mediaItemCount > 0 && player.playbackState == Player.STATE_READY) saveResume()
        scope.cancel()
        PlaybackHub.isPlaying.value = false
        PlaybackHub.session.value = null
        PlaybackHub.sleep.value = null
        session.release()
        player.release()
        super.onDestroy()
    }

    companion object {
        const val ACTION_SCHEDULED = "com.prabhat.app.PLAY_SCHEDULED"
        const val EXTRA_MANTRA = "mantra"
        private const val FADE_OUT_MS = 8_000L
    }
}
