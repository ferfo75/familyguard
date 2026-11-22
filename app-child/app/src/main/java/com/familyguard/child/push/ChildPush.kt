package com.familyguard.child.push

import android.content.Context
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.familyguard.child.data.Prefs
import com.familyguard.child.network.ApiClient
import com.familyguard.child.network.ChildPushTokenRequest
import com.familyguard.child.service.LocationTrackingService
import com.familyguard.child.worker.LocationFallbackWorker
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.tasks.await

/**
 * "Despertar" el seguimiento desde el servidor. Cuando el celular deja de reportar (Android durmió la app, algo
 * muy común en Motorola), el servidor manda un aviso de máxima prioridad; Android entrega ese aviso aunque la app
 * esté dormida y le permite arrancar el seguimiento de nuevo.
 */
object ChildPush {

    /** Le cuenta al servidor a qué token mandar el aviso. Es barato y se repite: el token puede cambiar. */
    suspend fun register(context: Context, prefs: Prefs = Prefs(context.applicationContext), token: String? = null): Boolean {
        if (prefs.deviceTokenOrNull() == null) return false // todavía no está emparejado
        return runCatching {
            val fcm = token ?: FirebaseMessaging.getInstance().token.await()
            ApiClient.create(prefs).registerChildPush(ChildPushTokenRequest(fcm)).isSuccessful
        }.getOrDefault(false)
    }

    /** Al llegar el aviso: vuelve a levantar el servicio de ubicación y manda ya mismo un ping de respaldo. */
    fun wake(context: Context) {
        val app = context.applicationContext
        // Que llegue un aviso de máxima prioridad es una de las excepciones con las que Android deja arrancar un
        // servicio en primer plano desde segundo plano.
        runCatching { LocationTrackingService.start(app) }
        runCatching {
            WorkManager.getInstance(app).enqueueUniqueWork(
                "wake_now", ExistingWorkPolicy.REPLACE, OneTimeWorkRequestBuilder<LocationFallbackWorker>().build(),
            )
        }
    }
}
