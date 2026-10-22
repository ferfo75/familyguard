package com.familyguard.child.boot

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.familyguard.child.data.Prefs
import com.familyguard.child.service.LocationTrackingService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking

/** Reinicia el seguimiento después de que el teléfono se reinicia. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val appContext = context.applicationContext
        val prefs = Prefs(appContext)
        CoroutineScope(Dispatchers.IO).launch {
            val isPaired = runBlocking { prefs.deviceTokenOrNull() } != null
            if (isPaired) LocationTrackingService.start(appContext)
        }
    }
}
