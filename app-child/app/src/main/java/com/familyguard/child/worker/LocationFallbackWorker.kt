package com.familyguard.child.worker

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.familyguard.child.data.Prefs
import com.familyguard.child.network.ApiClient
import com.familyguard.child.network.ChildSocketManager
import com.familyguard.child.network.LocationPingRequest
import com.familyguard.child.ring.RingPlayer
import com.familyguard.child.service.LocationTrackingService
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.tasks.await

/**
 * Red de seguridad para cuando el gestor de batería del fabricante (muy
 * común en Motorola) mata el foreground service de [LocationTrackingService]
 * a pesar de estar marcado como foreground. WorkManager usa su propio
 * mecanismo del sistema (JobScheduler/AlarmManager) que sobrevive mejor a
 * esas restricciones, así que aunque el servicio muera, este worker sigue
 * mandando un ping cada 15 minutos (el mínimo que permite WorkManager para
 * trabajo periódico) y, de paso, reintenta levantar el servicio.
 */
class LocationFallbackWorker(
    private val context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val prefs = Prefs(context)
        if (prefs.deviceTokenOrNull() == null) return Result.success() // todavía no emparejado

        // Esto es lo que de verdad "revive" el seguimiento cuando el gestor de
        // batería mató el foreground service: lo volvemos a arrancar acá.
        // Antes este worker solo mandaba su propio ping cada 15 minutos sin
        // tocar el servicio principal, así que si ese servicio moría, quedaba
        // muerto hasta que alguien abriera la app a mano — por eso Barby y
        // Joaco dejaban de reportar por horas. Llamar start() cuando el
        // servicio ya está corriendo no hace daño: Android simplemente
        // reusa la instancia existente. Lo envolvemos en runCatching porque
        // Android 12+ puede rechazar arrancar un foreground service desde un
        // Worker en segundo plano en algunos estados (no es crítico si falla
        // acá: igual mandamos nuestro propio ping de respaldo más abajo).
        runCatching { LocationTrackingService.start(context) }

        // Si el servicio en primer plano no llegó a levantar (Android 12+
        // puede rechazarlo desde segundo plano en algunos estados), al
        // menos probamos reconectar el canal de "hacer sonar" directamente
        // acá: no necesita permisos de foreground service, solo red, y así
        // el padre puede volver a hacer sonar el teléfono aunque el
        // seguimiento en vivo siga caído hasta el próximo intento.
        runCatching {
            val token = prefs.deviceTokenOrNull()
            if (token != null) {
                ChildSocketManager.connectAndListenForRing(token) { RingPlayer.start(context) }
            }
        }

        val fusedClient = LocationServices.getFusedLocationProviderClient(context)
        val location = runCatching {
            com.google.android.gms.location.CurrentLocationRequest.Builder()
                .setPriority(Priority.PRIORITY_HIGH_ACCURACY)
                // maxUpdateAgeMillis(0) obliga a pedir una lectura nueva del GPS en
                // vez de devolver una que Android ya tenía guardada por ahí cerca.
                .setMaxUpdateAgeMillis(0)
                .build()
                .let { fusedClient.getCurrentLocation(it, null).await() }
        }.getOrNull() ?: return Result.retry()

        val speed = if (location.hasSpeed()) location.speed else null
        val api = ApiClient.create(prefs)
        return runCatching {
            api.sendLocationPing(
                LocationPingRequest(location.latitude, location.longitude, location.accuracy, speed, batteryLevel = null)
            )
        }.fold(onSuccess = { Result.success() }, onFailure = { Result.retry() })
    }
}
