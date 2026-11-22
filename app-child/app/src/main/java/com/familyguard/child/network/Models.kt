package com.familyguard.child.network

data class RedeemPairingRequest(val code: String, val deviceModel: String)
data class RedeemPairingResponse(val deviceToken: String, val childDeviceId: String, val childName: String)

data class LocationPingRequest(
    val lat: Double,
    val lng: Double,
    val accuracyM: Float?,
    val speedMs: Float?,
    val batteryLevel: Int?,
    // "walking" | "running" | "bicycle" | "vehicle" | "still", o null si no
    // hay una detección reciente con confianza suficiente.
    val activityType: String? = null,
    // Hora real en que se tomó el punto (ISO-8601 UTC). Con esto un ping que no se pudo
    // mandar (sin señal, servidor dormido) se reenvía después y el recorrido no se pierde.
    val recordedAt: String? = null,
    val health: HealthDto? = null,
)

/** Estado del teléfono que le sirve al padre para saber POR QUÉ dejaría de reportar. */
data class HealthDto(
    val batteryUnrestricted: Boolean,
    val backgroundLocation: Boolean,
    val locationEnabled: Boolean,
    val appVersion: String,
)

data class HeartbeatRequest(val batteryLevel: Int?, val health: HealthDto?)

/** Token de FCM de este celular, para que el servidor pueda despertar el seguimiento. */
data class ChildPushTokenRequest(val token: String)

/** Misión asignada por el padre. status: "open" | "waiting" (esperando que la revisen) | "confirmed". */
data class TaskDto(
    val id: String,
    val title: String,
    val reward: String,
    val requiresPhoto: Boolean,
    val repeat: String,
    val dueDate: String,
    val status: String,
    val hasPhoto: Boolean,
)
data class TasksResponse(val tasks: List<TaskDto>)
data class DoneTaskRequest(val photoBase64: String?)

/** kind: "arrived" (llegué bien) | "on_my_way" (voy en camino, con etaMinutes obligatorio). */
data class CheckinRequest(val kind: String, val etaMinutes: Int?, val note: String?)

data class SosRequest(
    val lat: Double,
    val lng: Double,
    val message: String?,
    val audioClipBase64: String? = null,
)
data class SosAlertDto(val id: String)
data class SosResponse(val ok: Boolean, val alert: SosAlertDto)
data class SosAudioRequest(val audioClipBase64: String)

data class UsageAppEntry(val packageName: String, val appName: String, val usageMinutes: Int)
data class UsageReportRequest(val date: String, val apps: List<UsageAppEntry>)

data class BlockedAppRule(val packageName: String, val dailyLimitMin: Int?)
data class BlockedAppsResponse(val rules: List<BlockedAppRule>)

data class AppVersionInfo(
    val versionCode: Int,
    val versionName: String,
    val downloadUrl: String,
    val notes: String?,
)
