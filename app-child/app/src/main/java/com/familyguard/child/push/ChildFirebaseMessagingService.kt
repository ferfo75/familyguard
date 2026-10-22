package com.familyguard.child.push

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Reservado para comandos push del padre hacia el hijo (ej. "pedir ubicación
 * ahora"). Hoy el backend no envía nada a este canal todavía, pero queda la
 * base lista para esa función.
 */
class ChildFirebaseMessagingService : FirebaseMessagingService() {
    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
    }
}
