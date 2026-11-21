package com.familyguard.child.boot

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.familyguard.child.data.Prefs
import com.familyguard.child.service.LocationTrackingService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Reinicia el seguimiento cuando Android lo corta sin que el chico haga nada:
 *  - al encender el teléfono (BOOT_COMPLETED);
 *  - al actualizar la app (MY_PACKAGE_REPLACED). Sin esto, después de cada actualización el servicio
 *    quedaba muerto y los chicos aparecían "sin señal" hasta que alguien abría la app.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        val appContext = context.applicationContext
        val prefs = Prefs(appContext)
        // goAsync: el receptor sigue vivo mientras se lee el DataStore, si no Android puede cortarlo a la mitad.
        val pending = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val isPaired = prefs.deviceTokenOrNull() != null
                // Si falta el permiso de ubicación (o Android no deja arrancarlo ahora), no es un error:
                // el respaldo de WorkManager y la próxima vez que abran la app lo retoman.
                if (isPaired) runCatching { LocationTrackingService.start(appContext) }
            } finally {
                pending.finish()
            }
        }
    }
}
