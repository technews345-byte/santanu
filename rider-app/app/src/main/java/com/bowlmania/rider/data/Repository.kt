package com.bowlmania.rider.data

import com.bowlmania.rider.data.db.AppDatabase
import com.bowlmania.rider.data.db.CacheEntry
import com.bowlmania.rider.data.db.QueuedLocation
import com.bowlmania.rider.data.net.*
import kotlinx.serialization.KSerializer
import kotlinx.serialization.builtins.ListSerializer
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.time.Instant
import java.util.UUID

/** A result that may come from the offline cache ([cachedAt] is set) instead of the server. */
data class Loaded<T>(val data: T, val cachedAt: Long? = null)

/**
 * Single entry point to the server. The server is the source of truth: the cache is only used to show
 * the last known data when the network is down, and critical actions (status steps, OTPs, proof, cash,
 * attendance) always need a live server confirmation.
 */
class Repository(private val api: RiderApi, private val db: AppDatabase, private val session: SessionStore) {

    // ---------- Cache helpers ----------
    private suspend fun <T> cached(key: String, serializer: KSerializer<T>, fetch: suspend () -> T): Result<Loaded<T>> {
        val live = apiCall(fetch)
        live.onSuccess { db.cache().put(CacheEntry(key, json.encodeToString(serializer, it), System.currentTimeMillis())) }
        return live.fold(
            onSuccess = { Result.success(Loaded(it)) },
            onFailure = { err ->
                val hit = if (err is AppError.Offline) db.cache().get(key) else null
                if (hit != null) runCatching { Loaded(json.decodeFromString(serializer, hit.json), hit.updatedAt) } else Result.failure(err)
            },
        )
    }
    private suspend fun <T> store(key: String, serializer: KSerializer<T>, value: T) =
        db.cache().put(CacheEntry(key, json.encodeToString(serializer, value), System.currentTimeMillis()))

    // ---------- Session ----------
    suspend fun login(email: String, password: String): Result<Profile> =
        apiCall { api.login(LoginRequest(email.trim(), password)) }.map { session.save(it.token, it.rider); it.rider }

    suspend fun logout() {
        apiCall { api.logout(LogoutRequest(session.pushToken)) }
        clearLocal()
    }
    suspend fun clearLocal() { session.clear(); db.cache().clear(); db.locations().clear() }

    suspend fun refreshProfile(): Result<Profile> = apiCall { api.me() }.onSuccess { session.updateProfile(it) }
    suspend fun config() = cached("config", AppConfig.serializer()) { api.config() }
    suspend fun registerPushToken(token: String) {
        session.pushToken = token
        if (session.isSignedIn) apiCall { api.registerDevice(DeviceRequest(token)) }
    }

    // ---------- Home, status, sync ----------
    suspend fun home() = cached("home", Home.serializer()) { api.home() }
    suspend fun setOnline(online: Boolean) = apiCall { api.setStatus(StatusRequest(online)) }
    suspend fun sync(after: Long) = apiCall { api.sync(after) }

    // ---------- Deliveries ----------
    suspend fun deliveries() = cached("deliveries", Deliveries.serializer()) { api.deliveries() }
    suspend fun delivery(id: Int) = cached("delivery_$id", Delivery.serializer()) { api.delivery(id) }
    suspend fun accept(id: Int, key: String, lat: Double?, lng: Double?) =
        apiCall { api.accept(id, KeyRequest(key, lat, lng)) }.onSuccess { store("delivery_$id", Delivery.serializer(), it) }
    suspend fun reject(id: Int, reason: String) = apiCall { api.reject(id, RejectRequest(reason)) }
    suspend fun step(id: Int, step: String, key: String, otp: String? = null, lat: Double? = null, lng: Double? = null) =
        apiCall { api.step(id, StepRequest(step, otp, key, lat, lng)) }.onSuccess { store("delivery_$id", Delivery.serializer(), it) }
    suspend fun proof(id: Int, photoJpeg: ByteArray?, signaturePng: ByteArray?, note: String, key: String, lat: Double?, lng: Double?) = apiCall {
        api.proof(
            id,
            photoJpeg?.let { MultipartBody.Part.createFormData("photo", "delivery.jpg", it.toRequestBody(JPEG)) },
            signaturePng?.let { MultipartBody.Part.createFormData("signature", "signature.png", it.toRequestBody(PNG)) },
            note.text(), key.text(), lat?.toString()?.text(), lng?.toString()?.text(),
        )
    }.onSuccess { store("delivery_$id", Delivery.serializer(), it) }
    suspend fun history(status: String, from: String?, to: String?, page: Int) = apiCall { api.history(status, from, to, page) }
    suspend fun performance(from: String?, to: String?) = cached("performance_${from}_$to", Performance.serializer()) { api.performance(from, to) }

    // ---------- Location ----------
    suspend fun queueLocation(p: QueuedLocation) {
        db.locations().add(p)
        db.locations().trim(MAX_QUEUED)
    }
    /** Uploads queued points in batches. Returns false when the server says tracking should stop. */
    suspend fun flushLocations(): Result<Boolean> {
        while (true) {
            val batch = db.locations().oldest(100)
            if (batch.isEmpty()) return Result.success(true)
            val res = apiCall {
                api.location(LocationBatch(batch.map {
                    LocationPointDto(it.lat, it.lng, it.accuracy?.toDouble(), it.speed?.toDouble(), it.heading?.toDouble(), Instant.ofEpochMilli(it.timestamp).toString(), it.orderId)
                }))
            }
            val err = res.exceptionOrNull()
            if (err is AppError.Server && err.code == 409) { db.locations().clear(); return Result.success(false) }
            if (err != null) return Result.failure(err)
            db.locations().delete(batch.map { it.id })
        }
    }
    suspend fun queuedLocations() = db.locations().count()

    // ---------- Notifications ----------
    suspend fun notifications(before: Long? = null) = cached("notifications_${before ?: 0}", NotificationList.serializer()) { api.notifications(before) }
    suspend fun markRead(ids: List<Long>? = null) = apiCall { api.markRead(ReadRequest(ids)) }
    suspend fun clearRead() = apiCall { api.clearRead() }

    // ---------- Attendance ----------
    suspend fun attendance() = cached("attendance", AttendanceToday.serializer()) { api.attendance() }
    suspend fun checkIn(selfieJpeg: ByteArray, lat: Double, lng: Double, accuracy: Float?) = apiCall {
        api.checkIn(MultipartBody.Part.createFormData("selfie", "selfie.jpg", selfieJpeg.toRequestBody(JPEG)), lat.toString().text(), lng.toString().text(), accuracy?.toString()?.text())
    }.onSuccess { store("attendance", AttendanceToday.serializer(), it) }
    suspend fun checkOut(selfieJpeg: ByteArray?, lat: Double?, lng: Double?) = apiCall {
        api.checkOut(selfieJpeg?.let { MultipartBody.Part.createFormData("selfie", "selfie.jpg", it.toRequestBody(JPEG)) }, lat?.toString()?.text(), lng?.toString()?.text())
    }.onSuccess { store("attendance", AttendanceToday.serializer(), it) }
    suspend fun startBreak() = apiCall { api.startBreak() }.onSuccess { store("attendance", AttendanceToday.serializer(), it) }
    suspend fun endBreak() = apiCall { api.endBreak() }.onSuccess { store("attendance", AttendanceToday.serializer(), it) }
    suspend fun attendanceHistory() = cached("attendance_history", ListSerializer(AttendanceDay.serializer())) { api.attendanceHistory() }
    suspend fun leave() = cached("leave", ListSerializer(Leave.serializer())) { api.leave() }
    suspend fun requestLeave(from: String, to: String, reason: String) = apiCall { api.requestLeave(LeaveRequest(from, to, reason)) }
    suspend fun cancelLeave(id: Int) = apiCall { api.cancelLeave(id) }

    // ---------- Support & safety ----------
    suspend fun tickets() = cached("tickets", ListSerializer(TicketSummary.serializer())) { api.tickets() }
    suspend fun ticket(id: Int) = cached("ticket_$id", Ticket.serializer()) { api.ticket(id) }
    suspend fun createTicket(category: String, message: String, orderId: Int?, key: String, photoJpeg: ByteArray?) = apiCall {
        if (photoJpeg == null) api.createTicket(TicketRequest(category, message, orderId, key))
        else api.createTicketWithPhoto(category.text(), message.text(), orderId?.toString()?.text(), key.text(),
            MultipartBody.Part.createFormData("attachment", "photo.jpg", photoJpeg.toRequestBody(JPEG)))
    }
    suspend fun reply(id: Int, message: String) = apiCall { api.reply(id, MessageRequest(message)) }
    suspend fun emergency(type: String, message: String, orderId: Int?, key: String, lat: Double?, lng: Double?) =
        apiCall { api.emergency(EmergencyRequest(type, message, orderId, key, lat, lng)) }

    companion object {
        private val JPEG = "image/jpeg".toMediaType()
        private val PNG = "image/png".toMediaType()
        private val TEXT = "text/plain".toMediaType()
        private fun String.text(): RequestBody = toRequestBody(TEXT)
        const val MAX_QUEUED = 2000
        /** A fresh idempotency key for one rider action; retries of the same action reuse it. */
        fun newKey(): String = UUID.randomUUID().toString()
    }
}
