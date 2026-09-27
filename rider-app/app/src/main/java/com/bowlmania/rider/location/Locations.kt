package com.bowlmania.rider.location

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import androidx.core.content.ContextCompat
import androidx.core.location.LocationManagerCompat
import com.bowlmania.rider.BuildConfig
import com.bowlmania.rider.domain.Estimate
import com.bowlmania.rider.domain.Geo
import com.google.android.gms.location.CurrentLocationRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.security.MessageDigest

/** Why location is not available right now, in words the rider can act on. */
enum class LocationProblem(val message: String) {
    PERMISSION("Allow location access so the app can navigate and share your position while you work."),
    GPS_OFF("Turn on location (GPS) in your phone settings."),
    NO_FIX("Waiting for a GPS signal… Move to an open area if this takes long."),
}

object Locations {
    fun hasPermission(ctx: Context) = ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
        ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
    fun gpsOn(ctx: Context) = LocationManagerCompat.isLocationEnabled(ctx.getSystemService(LocationManager::class.java))
    fun problem(ctx: Context): LocationProblem? = when { !hasPermission(ctx) -> LocationProblem.PERMISSION; !gpsOn(ctx) -> LocationProblem.GPS_OFF; else -> null }

    /** A fresh fix (up to [timeoutMs]), falling back to the last known one. Null when unavailable. */
    @SuppressLint("MissingPermission")
    suspend fun current(ctx: Context, timeoutMs: Long = 12_000): Location? {
        if (problem(ctx) != null) return null
        val client = LocationServices.getFusedLocationProviderClient(ctx)
        return try {
            withTimeoutOrNull(timeoutMs) {
                client.getCurrentLocation(CurrentLocationRequest.Builder().setPriority(Priority.PRIORITY_HIGH_ACCURACY).setMaxUpdateAgeMillis(30_000).build(), null).await()
            } ?: client.lastLocation.await()
        } catch (_: Exception) { null }
    }
}

/**
 * Road distance and travel time from Google's Routes API (two-wheeler). Only used when a Maps API key is
 * configured; otherwise [Geo.estimate] gives an approximate figure that the UI marks with "≈".
 */
class RoutesClient(private val context: Context, private val http: OkHttpClient) {
    private val key = BuildConfig.MAPS_API_KEY
    private val cache = HashMap<String, Pair<Long, Estimate>>()

    suspend fun estimate(fromLat: Double, fromLng: Double, toLat: Double, toLng: Double): Estimate {
        val straight = Geo.haversineKm(fromLat, fromLng, toLat, toLng)
        if (key.isBlank()) return Geo.estimate(straight)
        // Re-route at most once per ~200 m of movement or once a minute.
        val cacheKey = "%.3f,%.3f>%.4f,%.4f".format(fromLat, fromLng, toLat, toLng)
        cache[cacheKey]?.let { (at, e) -> if (System.currentTimeMillis() - at < 60_000) return e }
        val routed = withContext(Dispatchers.IO) { runCatching { request(fromLat, fromLng, toLat, toLng) }.getOrNull() }
        return (routed ?: Geo.estimate(straight)).also { cache[cacheKey] = System.currentTimeMillis() to it }
    }

    private fun request(fromLat: Double, fromLng: Double, toLat: Double, toLng: Double): Estimate? {
        val body = """{"origin":{"location":{"latLng":{"latitude":$fromLat,"longitude":$fromLng}}},"destination":{"location":{"latLng":{"latitude":$toLat,"longitude":$toLng}}},"travelMode":"TWO_WHEELER","routingPreference":"TRAFFIC_AWARE"}"""
        val req = Request.Builder().url("https://routes.googleapis.com/directions/v2:computeRoutes")
            .header("X-Goog-Api-Key", key).header("X-Goog-FieldMask", "routes.duration,routes.distanceMeters")
            .header("X-Android-Package", context.packageName).header("X-Android-Cert", signingSha1())
            .post(body.toRequestBody("application/json".toMediaType())).build()
        http.newCall(req).execute().use { res ->
            if (!res.isSuccessful) return null
            val route = Json.parseToJsonElement(res.body?.string() ?: return null).jsonObject["routes"]?.jsonArray?.firstOrNull()?.jsonObject ?: return null
            val meters = route["distanceMeters"]?.jsonPrimitive?.content?.toDoubleOrNull() ?: return null
            val secs = route["duration"]?.jsonPrimitive?.content?.removeSuffix("s")?.toDoubleOrNull() ?: return null
            return Estimate(meters / 1000.0, (secs / 60).toInt().coerceAtLeast(1), approximate = false)
        }
    }

    @Suppress("DEPRECATION")
    private fun signingSha1(): String = runCatching {
        val pm = context.packageManager
        val sig = if (android.os.Build.VERSION.SDK_INT >= 28)
            pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNING_CERTIFICATES).signingInfo?.apkContentsSigners?.firstOrNull()
        else pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNATURES).signatures?.firstOrNull()
        MessageDigest.getInstance("SHA-1").digest(sig!!.toByteArray()).joinToString("") { "%02X".format(it) }
    }.getOrDefault("")
}
