package com.familyguard.child.data

import android.content.Context
import com.familyguard.child.network.ApiClient
import com.familyguard.child.network.LocationPingRequest

/** Único camino para mandar una ubicación: si no llega, queda en la bandeja de salida. */
object PingSender {

    /** @return true si el servidor lo recibió ahora mismo. */
    suspend fun send(context: Context, prefs: Prefs, ping: LocationPingRequest): Boolean {
        val api = ApiClient.create(prefs)
        val response = runCatching { api.sendLocationPing(ping) }.getOrNull()
        return when {
            response != null && response.isSuccessful -> {
                // Aprovecha la conexión que acaba de funcionar para vaciar lo que había quedado pendiente.
                PingOutbox.flush(context, api)
                true
            }
            // Rechazo permanente (token inválido, datos mal formados): guardarlo no sirve.
            PingOutbox.isPermanentRejection(response?.code()) -> false
            // Sin red, servidor dormido o error 5xx: se reenvía más tarde con su hora real.
            else -> {
                PingOutbox.add(context, ping)
                false
            }
        }
    }
}
