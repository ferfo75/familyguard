package com.familyguard.parent.network

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface ApiService {
    @POST("auth/register")
    suspend fun register(@Body body: RegisterRequest): Response<AuthResponse>

    @POST("auth/login")
    suspend fun login(@Body body: LoginRequest): Response<AuthResponse>

    @POST("auth/pairing/create")
    suspend fun createPairingCode(@Body body: CreatePairingRequest): Response<CreatePairingResponse>

    @GET("location/latest")
    suspend fun getLatestLocations(): Response<LatestLocationsResponse>

    @GET("location/{childDeviceId}/history")
    suspend fun getHistory(@Path("childDeviceId") childDeviceId: String, @Query("from") from: String? = null): Response<HistoryResponse>

    @GET("location/{childDeviceId}/frequent-places")
    suspend fun getFrequentPlaces(@Path("childDeviceId") childDeviceId: String): Response<FrequentPlacesResponse>

    @GET("location/{childDeviceId}/daily-summary")
    suspend fun getDailySummary(@Path("childDeviceId") childDeviceId: String): Response<DailySummaryResponse>

    @GET("geofences")
    suspend fun getGeofences(): Response<GeofencesResponse>

    @POST("geofences")
    suspend fun createGeofence(@Body body: CreateGeofenceRequest): Response<Unit>

    @DELETE("geofences/{id}")
    suspend fun deleteGeofence(@Path("id") id: String): Response<Unit>

    @GET("usage/{childDeviceId}/summary")
    suspend fun getUsageSummary(@Path("childDeviceId") childDeviceId: String, @Query("date") date: String? = null): Response<UsageSummaryResponse>

    @POST("usage/{childDeviceId}/blocked-apps")
    suspend fun setBlockedApp(@Path("childDeviceId") childDeviceId: String, @Body body: SetBlockedAppRequest): Response<Unit>

    @GET("sos")
    suspend fun getSosAlerts(): Response<SosAlertsResponse>

    @POST("sos/{id}/resolve")
    suspend fun resolveSosAlert(@Path("id") id: String): Response<Unit>

    @DELETE("sos/{id}")
    suspend fun deleteSosAlert(@Path("id") id: String): Response<Unit>

    @GET("tasks")
    suspend fun getTasks(@Query("childDeviceId") childDeviceId: String? = null): Response<TasksResponse>

    @POST("tasks")
    suspend fun createTask(@Body body: CreateTaskRequest): Response<TaskDto>

    @GET("tasks/{id}/photo")
    suspend fun getTaskPhoto(@Path("id") id: String): Response<TaskPhotoResponse>

    @POST("tasks/{id}/confirm")
    suspend fun confirmTask(@Path("id") id: String): Response<ConfirmTaskResponse>

    @POST("tasks/{id}/reject")
    suspend fun rejectTask(@Path("id") id: String): Response<TaskDto>

    @DELETE("tasks/{id}")
    suspend fun deleteTask(@Path("id") id: String): Response<Unit>

    @GET("feed")
    suspend fun getFeed(): Response<FeedResponse>

    /** Renueva la sesión mientras el token todavía es válido, así no vence si se usa la app seguido. */
    @POST("auth/refresh")
    suspend fun refreshSession(): Response<AuthResponse>

    @POST("push/register")
    suspend fun registerPushToken(@Body body: RegisterPushTokenRequest): Response<Unit>

    /** Al cerrar sesión, este celular deja de recibir las notificaciones de la familia. */
    @POST("push/unregister")
    suspend fun unregisterPushToken(@Body body: UnregisterPushTokenRequest): Response<Unit>

    @POST("auth/adults/invite")
    suspend fun inviteAdult(): Response<AdultInviteResponse>

    @POST("auth/adults/redeem")
    suspend fun redeemAdultInvite(@Body body: RedeemAdultRequest): Response<AuthResponse>

    @GET("auth/adults")
    suspend fun getAdults(): Response<AdultsResponse>

    @DELETE("auth/adults/{id}")
    suspend fun removeAdult(@Path("id") id: String): Response<Unit>

    @POST("commands/{childDeviceId}/ring")
    suspend fun ringDevice(@Path("childDeviceId") childDeviceId: String): Response<Unit>

    /** Despierta la app del hijo/a con un aviso de máxima prioridad (sirve aunque el seguimiento esté dormido). */
    @POST("commands/{childDeviceId}/wake")
    suspend fun wakeChild(@Path("childDeviceId") childDeviceId: String): Response<Unit>

    @POST("commands/{childDeviceId}/stop-ring")
    suspend fun stopRingDevice(@Path("childDeviceId") childDeviceId: String): Response<Unit>

    @GET("app/parent/latest")
    suspend fun getLatestAppVersion(): Response<AppVersionInfo>

    @DELETE("children/{childDeviceId}")
    suspend fun deleteChild(@Path("childDeviceId") childDeviceId: String): Response<Unit>
}
