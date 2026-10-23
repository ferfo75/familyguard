package com.familyguard.child.network

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

interface ApiService {
    @POST("auth/pairing/redeem")
    suspend fun redeemPairing(@Body body: RedeemPairingRequest): Response<RedeemPairingResponse>

    @POST("location/ping")
    suspend fun sendLocationPing(@Body body: LocationPingRequest): Response<Unit>

    @POST("sos")
    suspend fun sendSos(@Body body: SosRequest): Response<SosResponse>

    @POST("sos/{id}/audio")
    suspend fun uploadSosAudio(@Path("id") id: String, @Body body: SosAudioRequest): Response<Unit>

    @POST("usage/report")
    suspend fun reportUsage(@Body body: UsageReportRequest): Response<Unit>

    @GET("usage/blocked-apps")
    suspend fun getBlockedApps(): Response<BlockedAppsResponse>
}
