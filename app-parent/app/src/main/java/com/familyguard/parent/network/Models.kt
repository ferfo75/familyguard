package com.familyguard.parent.network

data class RegisterRequest(val email: String, val password: String, val name: String)
data class LoginRequest(val email: String, val password: String)
data class ParentInfo(val id: String, val email: String, val name: String)
data class AuthResponse(val token: String, val parent: ParentInfo)

// Otros adultos de la familia (la madre, por ejemplo)
data class RedeemAdultRequest(val code: String, val name: String, val email: String, val password: String)
data class AdultInviteResponse(val code: String, val expiresAt: String)
data class AdultInfo(val id: String, val name: String, val email: String)
data class AdultsMe(val owner: Boolean)
data class AdultOwner(val name: String)
data class AdultsResponse(val me: AdultsMe, val owner: AdultOwner, val adults: List<AdultInfo>)
data class UnregisterPushTokenRequest(val token: String)

data class CreatePairingRequest(val childName: String)
data class CreatePairingResponse(val code: String, val expiresAt: String)

data class LatestLocation(
    val lat: Double,
    val lng: Double,
    val speedMs: Float?,
    val activityType: String?,
    val recordedAt: String,
)
/** Salud del teléfono del hijo/a: lo que explica por qué dejaría de reportar. null = todavía no informó. */
data class ChildHealth(
    val batteryUnrestricted: Boolean?,
    val backgroundLocation: Boolean?,
    val locationEnabled: Boolean?,
    val appVersion: String?,
    val at: String?,
)
data class ChildLatest(
    val childDeviceId: String,
    val childName: String,
    val batteryLevel: Int?,
    val lastSeenAt: String?,
    val location: LatestLocation?,
    // Opcionales: un servidor viejo (o una caché vieja) no los trae.
    val lastHeartbeatAt: String? = null,
    val health: ChildHealth? = null,
    // Diagnóstico del despertar por push (null en un servidor viejo).
    val pushRegistered: Boolean? = null,
    val lastWakeAt: String? = null,
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

data class DailySummaryResponse(val summary: String, val generatedByAi: Boolean)

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

/** Misión que el padre le asigna al hijo/a. status: "open" | "waiting" (esperando aprobación) | "confirmed". */
data class TaskDto(
    val id: String,
    val childDeviceId: String,
    val title: String,
    val reward: String,
    val requiresPhoto: Boolean,
    val repeat: String, // "none" | "weekly" | "monthly"
    val dueDate: String,
    val status: String,
    val hasPhoto: Boolean,
    val doneAt: String?,
    val confirmedAt: String?,
)
data class TasksResponse(val tasks: List<TaskDto>)
data class CreateTaskRequest(
    val childDeviceId: String,
    val title: String,
    val reward: String,
    val requiresPhoto: Boolean,
    val repeat: String,
)
data class TaskPhotoResponse(val photoBase64: String)
data class ConfirmTaskResponse(val task: TaskDto, val next: TaskDto?)

/** Novedad para el padre: "llegó bien", "va en camino", "terminó una misión"… */
data class FeedEventDto(
    val id: String,
    val childDeviceId: String,
    val childName: String,
    val type: String,
    val title: String,
    val body: String,
    val createdAt: String,
)
data class FeedResponse(val events: List<FeedEventDto>)

data class RegisterPushTokenRequest(val token: String)

data class AppVersionInfo(
    val versionCode: Int,
    val versionName: String,
    val downloadUrl: String,
    val notes: String?,
)
