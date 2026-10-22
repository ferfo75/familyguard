package com.familyguard.child.network

data class RedeemPairingRequest(val code: String, val deviceModel: String)
data class RedeemPairingResponse(val deviceToken: String, val childDeviceId: String, val childName: String)

data class LocationPingRequest(val lat: Double, val lng: Double, val accuracyM: Float?, val batteryLevel: Int?)

data class SosRequest(val lat: Double, val lng: Double, val message: String?)

data class UsageAppEntry(val packageName: String, val appName: String, val usageMinutes: Int)
data class UsageReportRequest(val date: String, val apps: List<UsageAppEntry>)

data class BlockedAppRule(val packageName: String, val dailyLimitMin: Int?)
data class BlockedAppsResponse(val rules: List<BlockedAppRule>)
