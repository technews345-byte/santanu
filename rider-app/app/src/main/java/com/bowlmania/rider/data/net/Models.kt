package com.bowlmania.rider.data.net

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// API models for /api/rider. The only money amount riders ever see is the cash a customer must pay
// on cash-on-delivery orders (operational information).

@Serializable data class LoginRequest(val email: String, val password: String)
@Serializable data class LoginResponse(val token: String, val rider: Profile)

@Serializable
data class Profile(
    val id: Int,
    @SerialName("employee_id") val employeeId: String = "",
    val name: String,
    val email: String = "",
    val phone: String = "",
    val role: String = "",
    @SerialName("vehicle_type") val vehicleType: String = "",
    @SerialName("vehicle_number") val vehicleNumber: String = "",
    @SerialName("joining_date") val joiningDate: String? = null,
    val company: String = "",
    @SerialName("photo_url") val photoUrl: String? = null,
    @SerialName("shift_today") val shiftToday: Shift? = null,
)

@Serializable
data class Shift(
    val id: Int = 0,
    val date: String,
    @SerialName("start_time") val startTime: String,
    @SerialName("end_time") val endTime: String,
    val note: String = "",
)

@Serializable data class TodayStats(val deliveries: Int = 0, val completed: Int = 0, val pending: Int = 0, @SerialName("distance_km") val distanceKm: Double = 0.0)
@Serializable data class RiderRef(val id: Int, val name: String)
@Serializable data class HomeAttendance(val state: String = "not_checked_in", val shift: Shift? = null, @SerialName("on_leave") val onLeave: Boolean = false)

@Serializable
data class Home(
    val rider: RiderRef,
    val online: Boolean,
    @SerialName("online_since") val onlineSince: String? = null,
    val today: TodayStats = TodayStats(),
    val active: Delivery? = null,
    @SerialName("active_count") val activeCount: Int = 0,
    @SerialName("new_assignments") val newAssignments: List<Delivery> = emptyList(),
    val attendance: HomeAttendance = HomeAttendance(),
    @SerialName("unread_notifications") val unreadNotifications: Int = 0,
)

@Serializable data class Place(
    val name: String = "",
    val address: String? = "",
    val phone: String? = "",
    val landmark: String? = "",
    val lat: Double? = null,
    val lng: Double? = null,
    val instructions: String? = "",
)
@Serializable data class Item(val name: String, val size: String = "", val quantity: Int)
@Serializable data class Slot(val date: String? = null, val label: String = "", val start: String? = null, val end: String? = null)
@Serializable data class Payment(
    val method: String,
    val prepaid: Boolean = false,
    @SerialName("collect_amount") val collectAmount: Int = 0,
    @SerialName("cash_collected") val cashCollected: Boolean = false,
    @SerialName("cash_collected_at") val cashCollectedAt: String? = null,
)
@Serializable data class Requirements(
    @SerialName("pickup_otp") val pickupOtp: Boolean = true,
    @SerialName("delivery_otp") val deliveryOtp: Boolean = true,
    @SerialName("proof_photo") val proofPhoto: Boolean = true,
    val signature: Boolean = false,
    @SerialName("checkout_selfie") val checkoutSelfie: Boolean = false,
)
@Serializable data class Proof(val submitted: Boolean = false, val photo: Boolean = false, val signature: Boolean = false, val note: String? = "", val at: String? = null)
@Serializable data class Attempts(val pickup: Int = 0, val delivery: Int = 0)
@Serializable data class Times(
    val assigned: String? = null, val accepted: String? = null,
    @SerialName("to_restaurant") val toRestaurant: String? = null,
    @SerialName("at_restaurant") val atRestaurant: String? = null,
    @SerialName("picked_up") val pickedUp: String? = null,
    @SerialName("out_for_delivery") val outForDelivery: String? = null,
    @SerialName("at_customer") val atCustomer: String? = null,
    @SerialName("otp_verified") val otpVerified: String? = null,
    val delivered: String? = null,
)
@Serializable data class TimelineEvent(val step: String, val note: String = "", @SerialName("created_at") val createdAt: String)

@Serializable
data class Delivery(
    @SerialName("order_id") val orderId: Int,
    @SerialName("order_number") val orderNumber: String,
    @SerialName("order_status") val orderStatus: String,
    val status: String,
    @SerialName("status_label") val statusLabel: String = "",
    val next: List<String> = emptyList(),
    val restaurant: Place = Place(),
    val customer: Place = Place(),
    val items: List<Item> = emptyList(),
    @SerialName("delivery_distance_km") val deliveryDistanceKm: Double? = null,
    val slot: Slot? = null,
    val payment: Payment = Payment("cod"),
    val requirements: Requirements = Requirements(),
    val proof: Proof = Proof(),
    @SerialName("otp_attempts_left") val otpAttemptsLeft: Attempts = Attempts(),
    val times: Times = Times(),
    val timeline: List<TimelineEvent> = emptyList(),
)

@Serializable
data class Deliveries(
    val active: List<Delivery> = emptyList(),
    val new: List<Delivery> = emptyList(),
    @SerialName("completed_today") val completedToday: List<Delivery> = emptyList(),
    @SerialName("cancelled_today") val cancelledToday: List<Delivery> = emptyList(),
)

@Serializable data class HistoryRow(
    @SerialName("order_id") val orderId: Int,
    @SerialName("order_number") val orderNumber: String,
    val status: String,
    val at: String,
    @SerialName("distance_km") val distanceKm: Double? = null,
    val address: String? = null,
    val pickup: String = "",
)
@Serializable data class HistoryPage(val rows: List<HistoryRow> = emptyList(), val total: Int = 0, val page: Int = 1, val limit: Int = 30)

@Serializable data class StepRequest(val step: String, val otp: String? = null, val key: String? = null, val lat: Double? = null, val lng: Double? = null)
@Serializable data class KeyRequest(val key: String? = null, val lat: Double? = null, val lng: Double? = null)
@Serializable data class RejectRequest(val reason: String)
@Serializable data class OkResponse(val ok: Boolean = true)

@Serializable data class StatusRequest(val online: Boolean)
@Serializable data class StatusResponse(val online: Boolean, @SerialName("online_since") val onlineSince: String? = null)

@Serializable data class LocationPointDto(
    val latitude: Double, val longitude: Double, val accuracy: Double? = null, val speed: Double? = null,
    val heading: Double? = null, val timestamp: String, val orderId: Int? = null,
)
@Serializable data class LocationBatch(val points: List<LocationPointDto>)
@Serializable data class LocationResponse(val accepted: Int = 0)

@Serializable data class RiderNotification(
    val id: Long, val type: String, val title: String, val body: String = "",
    @SerialName("order_id") val orderId: Int? = null,
    @SerialName("ticket_id") val ticketId: Int? = null,
    @SerialName("read_at") val readAt: String? = null,
    @SerialName("created_at") val createdAt: String,
)
@Serializable data class NotificationList(val rows: List<RiderNotification> = emptyList(), val unread: Int = 0)
@Serializable data class ReadRequest(val ids: List<Long>? = null)
@Serializable data class UnreadResponse(val unread: Int = 0)
@Serializable data class SyncResponse(
    val online: Boolean = false, val tracking: Boolean = false,
    @SerialName("server_time") val serverTime: String = "",
    @SerialName("active_order_id") val activeOrderId: Int? = null,
    val notifications: List<RiderNotification> = emptyList(), val unread: Int = 0,
)
@Serializable data class DeviceRequest(val token: String, val platform: String = "android")
@Serializable data class LogoutRequest(@SerialName("device_token") val deviceToken: String? = null)

@Serializable data class AppConfig(
    val company: String = "Bowl Mania",
    @SerialName("support_phone") val supportPhone: String = "",
    @SerialName("emergency_number") val emergencyNumber: String = "112",
    @SerialName("stale_location_minutes") val staleLocationMinutes: Int = 5,
    val requirements: Requirements = Requirements(),
)

// ---------- Attendance ----------
@Serializable data class AttendanceRecord(
    val id: Int, val date: String, val status: String,
    @SerialName("check_in_at") val checkInAt: String,
    @SerialName("check_out_at") val checkOutAt: String? = null,
    @SerialName("check_in_selfie") val checkInSelfie: Boolean = false,
    @SerialName("check_out_selfie") val checkOutSelfie: Boolean = false,
)
@Serializable data class Break(val id: Int, @SerialName("started_at") val startedAt: String, @SerialName("ended_at") val endedAt: String? = null)
@Serializable data class Leave(
    val id: Int, @SerialName("from_date") val fromDate: String, @SerialName("to_date") val toDate: String,
    val reason: String = "", val status: String = "pending", @SerialName("created_at") val createdAt: String? = null,
)
@Serializable data class AttendanceRules(@SerialName("selfie_on_check_out") val selfieOnCheckOut: Boolean = false, @SerialName("shift_required") val shiftRequired: Boolean = false)
@Serializable data class AttendanceToday(
    val date: String,
    val shift: Shift? = null,
    @SerialName("on_leave") val onLeave: Leave? = null,
    val attendance: AttendanceRecord? = null,
    val breaks: List<Break> = emptyList(),
    @SerialName("on_break") val onBreak: Boolean = false,
    @SerialName("break_started_at") val breakStartedAt: String? = null,
    @SerialName("break_seconds") val breakSeconds: Long = 0,
    /** Time between a check-out and a later check-in on the same day (not work, not a break). */
    @SerialName("off_seconds") val offSeconds: Long = 0,
    /** How many times the rider checked in today. */
    val sessions: Int = 0,
    val state: String = "not_checked_in",
    @SerialName("upcoming_shifts") val upcomingShifts: List<Shift> = emptyList(),
    val rules: AttendanceRules = AttendanceRules(),
)
@Serializable data class ShiftTimes(@SerialName("start_time") val startTime: String, @SerialName("end_time") val endTime: String)
@Serializable data class AttendanceDay(
    val id: Int, val date: String, val status: String,
    @SerialName("check_in_at") val checkInAt: String,
    @SerialName("check_out_at") val checkOutAt: String? = null,
    val shift: ShiftTimes? = null,
    @SerialName("break_seconds") val breakSeconds: Long = 0,
    @SerialName("worked_seconds") val workedSeconds: Long? = null,
    val sessions: Int = 1,
)
@Serializable data class LeaveRequest(@SerialName("from_date") val fromDate: String, @SerialName("to_date") val toDate: String, val reason: String)

// ---------- Performance ----------
@Serializable data class Performance(
    val from: String, val to: String,
    @SerialName("total_deliveries") val totalDeliveries: Int = 0,
    val completed: Int = 0, val cancelled: Int = 0, val rejected: Int = 0,
    @SerialName("on_time") val onTime: Int = 0,
    @SerialName("on_time_rate") val onTimeRate: Int? = null,
    @SerialName("avg_delivery_minutes") val avgDeliveryMinutes: Int? = null,
    @SerialName("distance_km") val distanceKm: Double = 0.0,
    val rating: Double? = null,
    @SerialName("ratings_count") val ratingsCount: Int = 0,
)

// ---------- Support & safety ----------
@Serializable data class TicketSummary(
    val id: Int, val category: String, val subject: String, val status: String, val priority: String = "normal",
    @SerialName("created_at") val createdAt: String, @SerialName("updated_at") val updatedAt: String? = null,
    @SerialName("order_number") val orderNumber: String? = null, val replies: Int = 0,
    @SerialName("category_label") val categoryLabel: String = "",
)
@Serializable data class TicketMessage(
    val id: Int, @SerialName("from_rider") val fromRider: Int, val body: String,
    @SerialName("has_attachment") val hasAttachment: Int = 0, @SerialName("created_at") val createdAt: String, val author: String? = null,
)
@Serializable data class Ticket(
    val id: Int, val category: String, val subject: String, val status: String, val priority: String = "normal",
    @SerialName("order_id") val orderId: Int? = null, @SerialName("order_number") val orderNumber: String? = null,
    @SerialName("created_at") val createdAt: String, @SerialName("category_label") val categoryLabel: String = "",
    val messages: List<TicketMessage> = emptyList(),
)
@Serializable data class TicketRequest(val category: String, val message: String, @SerialName("order_id") val orderId: Int? = null, val key: String? = null, val lat: Double? = null, val lng: Double? = null)
@Serializable data class MessageRequest(val message: String)
@Serializable data class EmergencyRequest(val type: String, val message: String = "", @SerialName("order_id") val orderId: Int? = null, val key: String? = null, val lat: Double? = null, val lng: Double? = null)
@Serializable data class EmergencyResponse(@SerialName("ticket_id") val ticketId: Int, @SerialName("support_phone") val supportPhone: String = "", @SerialName("emergency_number") val emergencyNumber: String = "112")

@Serializable data class ApiErrorBody(val error: String? = null)
