package com.bowlmania.rider.data

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/** Non-sensitive app preferences (appearance, one-time prompts). */
class Prefs(context: Context) {
    private val p = context.getSharedPreferences("rider_prefs", Context.MODE_PRIVATE)
    private val _theme = MutableStateFlow(p.getString("theme", THEME_SYSTEM) ?: THEME_SYSTEM)
    val theme: StateFlow<String> = _theme

    fun setTheme(value: String) {
        p.edit().putString("theme", value).apply()
        _theme.value = value
    }

    var askedNotificationPermission: Boolean
        get() = p.getBoolean("asked_notifications", false)
        set(v) { p.edit().putBoolean("asked_notifications", v).apply() }

    companion object {
        const val THEME_SYSTEM = "system"
        const val THEME_LIGHT = "light"
        const val THEME_DARK = "dark"
    }
}
