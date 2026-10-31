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

/** The place whose sunrise and sunset sun-based schedules follow. Used only on the phone. */
@Serializable
data class Place(val lat: Double, val lng: Double, val name: String = "") {
    companion object {
        val JORHAT = Place(26.7509, 94.2037, "Jorhat, Assam")
    }
}

/** What a schedule's time follows: a clock time, or the day's sunrise or sunset plus [ScheduleRule.offsetMinutes]. */
@Serializable
enum class Anchor { TIME, SUNRISE, SUNSET }

/** Played before a scheduled mantra, under the fade-in. */
@Serializable
enum class Ambience { NONE, BELLS, BIRDS }

/** A daily playback time on a set of ISO days of the week (1 = Monday … 7 = Sunday). */
@Serializable
data class ScheduleRule(
    val id: String,
    val hour: Int = 6,
    val minute: Int = 30,
    val anchor: Anchor = Anchor.TIME,
    val offsetMinutes: Int = 0,
    val days: Set<Int> = ALL_DAYS,
    /** The mantra to play, or null for the default mantra. */
    val mantraId: String? = null,
    val enabled: Boolean = true,
    /** Plays for this session, or null to use the app's repeat setting. */
    val repeat: Int? = null,
) {
    companion object {
        val ALL_DAYS = (1..7).toSet()
    }
}

@Serializable
enum class ThemeMode { AUTO, SYSTEM, LIGHT, DARK }

/** Where playback stopped, so pressing Play continues from there. */
@Serializable
data class ResumePoint(val mantraId: String, val positionMs: Long, val played: Int = 0)

@Serializable
data class AppState(
    val mantras: List<Mantra> = emptyList(),
    val schedules: List<ScheduleRule> = listOf(ScheduleRule(id = "morning")) + DEFAULT_EXTRA_SCHEDULES,
    val scheduleOn: Boolean = true,
    val defaultMantraId: String? = null,
    /** How many times a session plays the mantra; [CONTINUOUS] loops until stopped. */
    val repeat: Int = 3,
    val volume: Float = 1f,
    val fadeInSeconds: Int = 20,
    val theme: ThemeMode = ThemeMode.AUTO,
    val ambience: Ambience = Ambience.NONE,
    /** A short vibration as each repetition (japa) completes. */
    val haptics: Boolean = true,
    val place: Place? = Place.JORHAT,
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
    /** When the last morning session finished (epoch ms), to tell done sessions from missed ones. */
    val lastCompletedAt: Long = 0,
) {
    fun mantra(id: String?): Mantra? = mantras.firstOrNull { it.id == id }
    val defaultMantra: Mantra? get() = mantra(defaultMantraId) ?: mantras.firstOrNull()

    /** The mantra a schedule plays: its own choice if still in the library, else the default. */
    fun mantraFor(rule: ScheduleRule?): Mantra? = mantra(rule?.mantraId) ?: defaultMantra
    fun repeatFor(rule: ScheduleRule?): Int = rule?.repeat ?: repeat

    companion object {
        const val CONTINUOUS = 0
        val REPEAT_OPTIONS = listOf(1, 3, 5, 11, 21, 54, 108, CONTINUOUS)
        val FADE_OPTIONS = listOf(0, 10, 20, 30, 60, 120)

        /** Shri Hanuman Chalisa once at 7:00 AM every day (also added once to existing installs). */
        val HANUMAN_SCHEDULE = ScheduleRule(id = "hanuman", hour = 7, minute = 0, mantraId = "hanuman-chalisa", repeat = 1)
        val DEFAULT_EXTRA_SCHEDULES = listOf(HANUMAN_SCHEDULE)
    }
}
