package com.familyguard.parent.push

import com.familyguard.parent.data.Prefs
import com.familyguard.parent.network.ApiClient
import com.familyguard.parent.network.RegisterPushTokenRequest
import com.familyguard.parent.network.UnregisterPushTokenRequest
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume

/**
 * Registro de este celular para recibir las notificaciones de la familia.
 * Antes solo se registraba cuando Firebase cambiaba el token, así que quien iniciaba sesión
 * en un celular ya instalado podía quedar sin avisos, y quien cerraba sesión los seguía recibiendo.
 */
object PushRegistration {

    private suspend fun fcmToken(): String? = withTimeoutOrNull(10_000) {
        suspendCancellableCoroutine { cont ->
            runCatching {
                FirebaseMessaging.getInstance().token.addOnCompleteListener { t ->
                    if (cont.isActive) cont.resume(if (t.isSuccessful) t.result else null)
                }
            }.onFailure { if (cont.isActive) cont.resume(null) }
        }
    }

    /** Idempotente: se puede llamar en cada inicio de sesión. */
    suspend fun register(prefs: Prefs) {
        val token = fcmToken() ?: return
        runCatching { ApiClient.create(prefs).registerPushToken(RegisterPushTokenRequest(token)) }
    }

    /** Hay que llamarlo ANTES de borrar la sesión (la llamada necesita estar autenticada). */
    suspend fun unregister(prefs: Prefs) {
        val token = fcmToken() ?: return
        runCatching { ApiClient.create(prefs).unregisterPushToken(UnregisterPushTokenRequest(token)) }
    }
}
