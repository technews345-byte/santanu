package com.bowlmania.rider.data.net

import com.bowlmania.rider.BuildConfig
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.HttpException
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.io.IOException
import java.util.concurrent.TimeUnit

val json = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    coerceInputValues = true
    isLenient = true
}

/** A failed server call, with a message that can be shown to the rider as is. */
sealed class AppError(message: String) : Exception(message) {
    /** No connection or the server could not be reached. */
    class Offline : AppError("No internet connection. Check your network and try again.")
    /** The session ended (signed out elsewhere, disabled account or expired token). */
    class SessionExpired(message: String) : AppError(message)
    /** The server refused the request; `message` comes from the server. */
    class Server(val code: Int, message: String) : AppError(message)
    class Unexpected(message: String) : AppError(message)
}

/** Emits when any request comes back 401 so the app can return to the sign-in screen. */
object SessionEvents {
    private val _expired = MutableSharedFlow<String>(extraBufferCapacity = 1)
    val expired: SharedFlow<String> = _expired
    fun expire(message: String) { _expired.tryEmit(message) }
}

class Network(tokenProvider: () -> String?) {
    val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .addInterceptor { chain ->
            val token = tokenProvider()
            val req = chain.request().newBuilder()
                .header("Accept", "application/json")
                .header("User-Agent", "BowlManiaRider/${BuildConfig.VERSION_NAME} Android")
                .apply { if (token != null) header("Authorization", "Bearer $token") }
                .build()
            val res = chain.proceed(req)
            if (res.code == 401 && token != null && !req.url.encodedPath.endsWith("/login")) {
                SessionEvents.expire(errorMessage(res.peekBody(4096).string()) ?: "Your session has ended. Please sign in again.")
            }
            res
        }
        .build()

    val api: RiderApi = Retrofit.Builder()
        .baseUrl(BuildConfig.API_BASE_URL)
        .client(client)
        .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
        .build()
        .create(RiderApi::class.java)
}

fun errorMessage(body: String?): String? = try {
    body?.let { json.decodeFromString(ApiErrorBody.serializer(), it).error }
} catch (_: Exception) { null }

/** Runs a request and turns every failure into an [AppError] with a readable message. */
suspend fun <T> apiCall(block: suspend () -> T): Result<T> = try {
    Result.success(block())
} catch (e: HttpException) {
    val msg = errorMessage(e.response()?.errorBody()?.string())
    Result.failure(
        when (e.code()) {
            401 -> AppError.SessionExpired(msg ?: "Your session has ended. Please sign in again.")
            413 -> AppError.Server(413, "That photo is too large. Please take it again.")
            429 -> AppError.Server(429, msg ?: "Too many attempts. Please wait a few minutes.")
            in 500..599 -> AppError.Server(e.code(), "The server had a problem. Please try again in a moment.")
            else -> AppError.Server(e.code(), msg ?: "Request failed (${e.code()}).")
        }
    )
} catch (e: IOException) {
    Result.failure(AppError.Offline())
} catch (e: kotlinx.coroutines.CancellationException) {
    throw e
} catch (e: Exception) {
    Result.failure(AppError.Unexpected("Something went wrong. Please try again."))
}
