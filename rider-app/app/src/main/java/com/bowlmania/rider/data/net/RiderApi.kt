package com.bowlmania.rider.data.net

import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query

/** The Bowl Mania server's rider API (`/api/rider`). */
interface RiderApi {
    @POST("api/rider/login") suspend fun login(@Body body: LoginRequest): LoginResponse
    @POST("api/rider/logout") suspend fun logout(@Body body: LogoutRequest): OkResponse
    @GET("api/rider/me") suspend fun me(): Profile
    @GET("api/rider/config") suspend fun config(): AppConfig
    @POST("api/rider/device") suspend fun registerDevice(@Body body: DeviceRequest): OkResponse

    @GET("api/rider/home") suspend fun home(): Home
    @GET("api/rider/sync") suspend fun sync(@Query("after") after: Long): SyncResponse
    @POST("api/rider/status") suspend fun setStatus(@Body body: StatusRequest): StatusResponse
    @POST("api/rider/location") suspend fun location(@Body body: LocationBatch): LocationResponse

    @GET("api/rider/deliveries") suspend fun deliveries(): Deliveries
    @GET("api/rider/deliveries/history") suspend fun history(
        @Query("status") status: String, @Query("from") from: String?, @Query("to") to: String?, @Query("page") page: Int,
    ): HistoryPage
    @GET("api/rider/deliveries/{id}") suspend fun delivery(@Path("id") id: Int): Delivery
    @POST("api/rider/deliveries/{id}/accept") suspend fun accept(@Path("id") id: Int, @Body body: KeyRequest): Delivery
    @POST("api/rider/deliveries/{id}/reject") suspend fun reject(@Path("id") id: Int, @Body body: RejectRequest): OkResponse
    @POST("api/rider/deliveries/{id}/step") suspend fun step(@Path("id") id: Int, @Body body: StepRequest): Delivery
    @Multipart @POST("api/rider/deliveries/{id}/proof") suspend fun proof(
        @Path("id") id: Int, @Part photo: MultipartBody.Part?, @Part signature: MultipartBody.Part?,
        @Part("note") note: RequestBody, @Part("key") key: RequestBody, @Part("lat") lat: RequestBody?, @Part("lng") lng: RequestBody?,
    ): Delivery
    @GET("api/rider/performance") suspend fun performance(@Query("from") from: String?, @Query("to") to: String?): Performance

    @GET("api/rider/notifications") suspend fun notifications(@Query("before") before: Long?): NotificationList
    @POST("api/rider/notifications/read") suspend fun markRead(@Body body: ReadRequest): UnreadResponse
    @DELETE("api/rider/notifications") suspend fun clearRead(): UnreadResponse

    @GET("api/rider/attendance") suspend fun attendance(): AttendanceToday
    @Multipart @POST("api/rider/attendance/check-in") suspend fun checkIn(
        @Part selfie: MultipartBody.Part, @Part("lat") lat: RequestBody, @Part("lng") lng: RequestBody, @Part("accuracy") accuracy: RequestBody?,
    ): AttendanceToday
    @Multipart @POST("api/rider/attendance/check-out") suspend fun checkOut(
        @Part selfie: MultipartBody.Part?, @Part("lat") lat: RequestBody?, @Part("lng") lng: RequestBody?,
    ): AttendanceToday
    @POST("api/rider/attendance/break/start") suspend fun startBreak(): AttendanceToday
    @POST("api/rider/attendance/break/end") suspend fun endBreak(): AttendanceToday
    @GET("api/rider/attendance/history") suspend fun attendanceHistory(): List<AttendanceDay>
    @GET("api/rider/leave") suspend fun leave(): List<Leave>
    @POST("api/rider/leave") suspend fun requestLeave(@Body body: LeaveRequest): Leave
    @POST("api/rider/leave/{id}/cancel") suspend fun cancelLeave(@Path("id") id: Int): OkResponse

    @GET("api/rider/support/tickets") suspend fun tickets(): List<TicketSummary>
    @POST("api/rider/support/tickets") suspend fun createTicket(@Body body: TicketRequest): Ticket
    @Multipart @POST("api/rider/support/tickets") suspend fun createTicketWithPhoto(
        @Part("category") category: RequestBody, @Part("message") message: RequestBody, @Part("order_id") orderId: RequestBody?,
        @Part("key") key: RequestBody, @Part attachment: MultipartBody.Part,
    ): Ticket
    @GET("api/rider/support/tickets/{id}") suspend fun ticket(@Path("id") id: Int): Ticket
    @POST("api/rider/support/tickets/{id}/messages") suspend fun reply(@Path("id") id: Int, @Body body: MessageRequest): Ticket
    @POST("api/rider/emergency") suspend fun emergency(@Body body: EmergencyRequest): EmergencyResponse
}
