package com.bowlmania.rider.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.bowlmania.rider.data.net.Profile
import com.bowlmania.rider.data.net.json
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * Keeps the session token and the rider's profile in encrypted storage (Android Keystore backed).
 * Nothing sensitive is written to plain preferences or logs.
 */
class SessionStore(context: Context) {
    private val prefs: SharedPreferences = try {
        EncryptedSharedPreferences.create(
            context, "rider_session",
            MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    } catch (e: Exception) {
        // A corrupted keystore entry (e.g. after a restore) must not lock the rider out: start a clean session store.
        context.deleteSharedPreferences("rider_session")
        EncryptedSharedPreferences.create(
            context, "rider_session",
            MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    private val _profile = MutableStateFlow(readProfile())
    val profile: StateFlow<Profile?> = _profile

    val token: String? get() = prefs.getString("token", null)
    val isSignedIn: Boolean get() = token != null

    fun save(token: String, profile: Profile) {
        prefs.edit().putString("token", token).putString("profile", json.encodeToString(Profile.serializer(), profile)).apply()
        _profile.value = profile
    }
    fun updateProfile(profile: Profile) {
        prefs.edit().putString("profile", json.encodeToString(Profile.serializer(), profile)).apply()
        _profile.value = profile
    }
    fun clear() {
        prefs.edit().clear().apply()
        _profile.value = null
    }

    /** Highest notification id already shown, so background sync never repeats an alert. */
    var lastNotificationId: Long
        get() = prefs.getLong("last_notification_id", 0)
        set(v) { prefs.edit().putLong("last_notification_id", v).apply() }

    var pushToken: String?
        get() = prefs.getString("push_token", null)
        set(v) { prefs.edit().putString("push_token", v).apply() }

    private fun readProfile(): Profile? = try {
        prefs.getString("profile", null)?.let { json.decodeFromString(Profile.serializer(), it) }
    } catch (_: Exception) { null }
}
