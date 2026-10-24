package com.familyguard.child.network

import com.familyguard.child.BuildConfig
import io.socket.client.IO
import io.socket.client.Socket

/**
 * Conexión en vivo con el backend para recibir comandos del padre (por
 * ahora, "hacer sonar el teléfono"). Se conecta con el mismo deviceToken
 * que usa para las llamadas REST.
 */
object ChildSocketManager {
    private var socket: Socket? = null

    fun connect(deviceToken: String) {
        if (socket?.connected() == true) return
        val options = IO.Options.builder().setAuth(mapOf("token" to deviceToken)).build()
        val baseUrl = BuildConfig.API_BASE_URL.removeSuffix("/")
        socket = IO.socket(java.net.URI.create(baseUrl), options).apply { connect() }
    }

    // off() antes de on() evita que se acumulen listeners duplicados si esto
    // se llama más de una vez (por ejemplo, cada vez que se reabre la app).
    fun onRingCommand(listener: () -> Unit) {
        socket?.off("command:ring")
        socket?.on("command:ring") { listener() }
    }

    /** Conecta y deja escuchando "hacer sonar" en un solo paso, para no repetir
     * la secuencia en cada lugar que puede necesitar levantar el socket
     * (el servicio en primer plano y, de respaldo, el worker periódico). */
    fun connectAndListenForRing(deviceToken: String, onRing: () -> Unit) {
        connect(deviceToken)
        onRingCommand(onRing)
    }

    fun disconnect() {
        socket?.disconnect()
        socket = null
    }
}
