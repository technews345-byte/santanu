package com.prabhat.app.data

import kotlinx.serialization.Serializable

/** One audio track in the library. [file] is an absolute path inside the app's storage or an android.resource:// URI. */
@Serializable
data class Mantra(
    val id: String,
    val name: String,
    val file: String,
    val description: String = "",
    /** The words of the mantra, shown while it plays. */
    val lyrics: String = "",
    val cover: String? = null,
    val durationMs: Long = 0,
    val builtIn: Boolean = false,
    val addedAt: Long = 0,
)

/** A daily playback time on a set of ISO days of the week (1 = Monday … 7 = Sunday). */
@Serializable
data class ScheduleRule(
    val id: String,
    val hour: Int = 6,
    val minute: Int = 30,
    val days: Set<Int> = ALL_DAYS,
    /** The mantra to play, or null for the default mantra. */
    val mantraId: String? = null,
    val enabled: Boolean = true,
) {
    companion object {
        val ALL_DAYS = (1..7).toSet()
    }
}

@Serializable
enum class ThemeMode { SYSTEM, LIGHT, DARK }

/** Where playback stopped, so pressing Play continues from there. */
@Serializable
data class ResumePoint(val mantraId: String, val positionMs: Long, val played: Int = 0)

@Serializable
data class AppState(
    val mantras: List<Mantra> = emptyList(),
    val schedules: List<ScheduleRule> = listOf(ScheduleRule(id = "morning")),
    val scheduleOn: Boolean = true,
    val defaultMantraId: String? = null,
    /** How many times a session plays the mantra; [CONTINUOUS] loops until stopped. */
    val repeat: Int = 3,
    val volume: Float = 1f,
    val fadeInSeconds: Int = 20,
    val theme: ThemeMode = ThemeMode.SYSTEM,
    val notifyReminder: Boolean = true,
    val notifyStart: Boolean = true,
    val notifyComplete: Boolean = true,
    val reminderLeadMinutes: Int = 10,
    val onboarded: Boolean = false,
    /** Set once the starter mantra has been added, so deleting it does not bring it back. */
    val seeded: Boolean = false,
    /** Built-in mantras already added once (see Library.seed). */
    val seededIds: Set<String> = emptySet(),
    val resume: ResumePoint? = null,
    /** The scheduled time (epoch ms) of the last alarm that fired, to ignore duplicate deliveries. */
    val lastFiredAt: Long = 0,
    /** ISO date of the last completed morning session. */
    val completedOn: String? = null,
) {
    fun mantra(id: String?): Mantra? = mantras.firstOrNull { it.id == id }
    val defaultMantra: Mantra? get() = mantra(defaultMantraId) ?: mantras.firstOrNull()

    /** The mantra a schedule plays: its own choice if still in the library, else the default. */
    fun mantraFor(rule: ScheduleRule?): Mantra? = mantra(rule?.mantraId) ?: defaultMantra

    companion object {
        const val CONTINUOUS = 0
        val REPEAT_OPTIONS = listOf(1, 3, 5, 11, 108, CONTINUOUS)
        val FADE_OPTIONS = listOf(0, 5, 10, 20, 30, 60)
    }
}
