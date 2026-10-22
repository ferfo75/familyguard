package com.familyguard.parent.network

import com.familyguard.parent.BuildConfig
import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONObject

/**
 * Conexión en tiempo real con el backend: recibe actualizaciones de
 * ubicación, eventos de geocercas y alertas SOS sin tener que hacer polling.
 * Una sola instancia viva mientras el padre tiene sesión abierta.
 */
object SocketManager {
    private var socket: Socket? = null

    fun connect(token: String) {
        if (socket?.connected() == true) return
        val options = IO.Options.builder().setAuth(mapOf("token" to token)).build()
        socket = IO.socket(java.net.URI.create(BuildConfig.SOCKET_URL), options).apply { connect() }
    }

    fun disconnect() {
        socket?.disconnect()
        socket = null
    }

    fun onLocationUpdate(listener: (JSONObject) -> Unit) {
        socket?.on("location:update") { args -> (args.firstOrNull() as? JSONObject)?.let(listener) }
    }

    fun onGeofenceEvent(listener: (JSONObject) -> Unit) {
        socket?.on("geofence:event") { args -> (args.firstOrNull() as? JSONObject)?.let(listener) }
    }

    fun onSosAlert(listener: (JSONObject) -> Unit) {
        socket?.on("sos:alert") { args -> (args.firstOrNull() as? JSONObject)?.let(listener) }
    }
}
