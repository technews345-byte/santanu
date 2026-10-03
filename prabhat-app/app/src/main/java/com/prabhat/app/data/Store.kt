package com.prabhat.app.data

import android.content.Context
import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.json.Json
import java.io.File

/**
 * All settings, the library and the schedule, kept in one small JSON file in the app's private storage.
 * Shared by the UI, the playback service and the alarm receivers (all in one process). Writes are atomic.
 */
object Store {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private lateinit var file: File
    private val _state = MutableStateFlow(AppState())
    val state: StateFlow<AppState> = _state
    val value: AppState get() = _state.value

    fun init(context: Context) {
        if (::file.isInitialized) return
        file = File(context.filesDir, "prabhat.json")
        _state.value = runCatching { json.decodeFromString(AppState.serializer(), file.readText()) }
            .onFailure { if (file.exists()) Log.w("Prabhat", "Settings file unreadable, starting fresh", it) }
            .getOrDefault(AppState())
    }

    @Synchronized
    fun update(change: (AppState) -> AppState): AppState {
        val next = change(_state.value)
        if (next == _state.value) return next
        _state.value = next
        runCatching {
            val tmp = File(file.parentFile, file.name + ".tmp")
            tmp.writeText(json.encodeToString(AppState.serializer(), next))
            if (!tmp.renameTo(file)) { file.delete(); tmp.renameTo(file) }
        }.onFailure { Log.e("Prabhat", "Could not save settings", it) }
        return next
    }
}
