package com.familyguard.child.network

data class RedeemPairingRequest(val code: String, val deviceModel: String)
data class RedeemPairingResponse(val deviceToken: String, val childDeviceId: String, val childName: String)

data class LocationPingRequest(
    val lat: Double,
    val lng: Double,
    val accuracyM: Float?,
    val speedMs: Float?,
    val batteryLevel: Int?,
)

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
