package com.familyguard.child

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build

class FamilyGuardChildApp : Application() {
    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_TRACKING,
                "Seguimiento activo",
                NotificationManager.IMPORTANCE_LOW
            ).apply { description = "Indica que FamilyGuard está compartiendo la ubicación" }
        )
    }

    companion object {
        const val CHANNEL_TRACKING = "tracking"
    }
}
