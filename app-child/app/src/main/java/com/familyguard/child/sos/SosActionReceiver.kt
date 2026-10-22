package com.familyguard.child.sos

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.core.content.ContextCompat
import com.familyguard.child.data.Prefs
import com.familyguard.child.network.ApiClient
import com.familyguard.child.network.SosRequest
import com.google.android.gms.location.LocationServices
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

/**
 * Botón de pánico: se dispara desde la acción de la notificación persistente
 * o desde un botón en la UI. Toma la última ubicación conocida y avisa al
 * backend, que a su vez notifica al padre en tiempo real.
 */
class SosActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val prefs = Prefs(context.applicationContext)
        val api = ApiClient.create(prefs)
        val fusedClient = LocationServices.getFusedLocationProviderClient(context)

        CoroutineScope(Dispatchers.IO).launch {
            runCatching {
                val location = fusedClient.lastLocation.await()
                if (location != null) {
                    api.sendSos(SosRequest(location.latitude, location.longitude, "Botón de pánico activado"))
                }
            }.onSuccess {
                withMainToast(context, "Se envió tu alerta. Ya avisamos a tu familia.")
            }.onFailure {
                withMainToast(context, "No se pudo enviar la alerta. Revisá tu conexión.")
            }
        }
    }

    private fun withMainToast(context: Context, message: String) {
        ContextCompat.getMainExecutor(context).execute {
            Toast.makeText(context, message, Toast.LENGTH_LONG).show()
        }
    }
}
