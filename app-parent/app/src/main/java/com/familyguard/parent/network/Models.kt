package com.familyguard.parent.network

data class RegisterRequest(val email: String, val password: String, val name: String)
data class LoginRequest(val email: String, val password: String)
data class ParentInfo(val id: String, val email: String, val name: String)
data class AuthResponse(val token: String, val parent: ParentInfo)

data class CreatePairingRequest(val childName: String)
data class CreatePairingResponse(val code: String, val expiresAt: String)

data class LatestLocation(
    val lat: Double,
    val lng: Double,
    val speedMs: Float?,
    val activityType: String?,
    val recordedAt: String,
)
data class ChildLatest(
    val childDeviceId: String,
    val childName: String,
    val batteryLevel: Int?,
    val lastSeenAt: String?,
    val location: LatestLocation?,
)
data class LatestLocationsResponse(val children: List<ChildLatest>)

data class HistoryPoint(val lat: Double, val lng: Double, val speedMs: Float?, val recordedAt: String)
data class HistoryResponse(val points: List<HistoryPoint>)

data class FrequentPlace(
    val lat: Double,
    val lng: Double,
    val visitDays: Int,
    val totalPings: Int,
    val typicalFromHour: Int,
    val typicalToHour: Int,
)
data class FrequentPlacesResponse(val places: List<FrequentPlace>, val windowDays: Int)

data class Geofence(
    val id: String,
    val name: String,
    val lat: Double,
    val lng: Double,
    val radiusMeters: Double,
    val childDeviceId: String?,
)
data class GeofencesResponse(val geofences: List<Geofence>)
data class CreateGeofenceRequest(
    val name: String,
    val lat: Double,
    val lng: Double,
    val radiusMeters: Double,
    val childDeviceId: String?,
)

data class UsageAppRecord(val packageName: String, val appName: String, val usageMinutes: Int)
data class UsageSummaryResponse(val date: String, val apps: List<UsageAppRecord>)

data class SetBlockedAppRequest(val packageName: String, val dailyLimitMin: Int?)

data class SosAlert(
    val id: String,
    val childDeviceId: String,
    val childName: String,
    val lat: Double,
    val lng: Double,
    val message: String?,
    val audioClipBase64: String?,
    val createdAt: String,
    val resolvedAt: String?,
)
data class SosAlertsResponse(val alerts: List<SosAlert>)

data class RegisterPushTokenRequest(val token: String)

data class AppVersionInfo(
    val versionCode: Int,
    val versionName: String,
    val downloadUrl: String,
    val notes: String?,
)
