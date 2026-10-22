package com.familyguard.child.network

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

interface ApiService {
    @POST("auth/pairing/redeem")
    suspend fun redeemPairing(@Body body: RedeemPairingRequest): Response<RedeemPairingResponse>

    @POST("location/ping")
    suspend fun sendLocationPing(@Body body: LocationPingRequest): Response<Unit>

    @POST("sos")
    suspend fun sendSos(@Body body: SosRequest): Response<Unit>

    @POST("usage/report")
    suspend fun reportUsage(@Body body: UsageReportRequest): Response<Unit>

    @GET("usage/blocked-apps")
    suspend fun getBlockedApps(): Response<BlockedAppsResponse>
}
