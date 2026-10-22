package com.familyguard.child.worker

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.familyguard.child.data.Prefs
import com.familyguard.child.network.ApiClient
import com.familyguard.child.network.LocationPingRequest
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

        val fusedClient = LocationServices.getFusedLocationProviderClient(context)
        val location = runCatching {
            com.google.android.gms.location.CurrentLocationRequest.Builder()
                .setPriority(Priority.PRIORITY_HIGH_ACCURACY)
                .build()
                .let { fusedClient.getCurrentLocation(it, null).await() }
        }.getOrNull() ?: return Result.retry()

        val api = ApiClient.create(prefs)
        return runCatching {
            api.sendLocationPing(
                LocationPingRequest(location.latitude, location.longitude, location.accuracy, null)
            )
        }.fold(onSuccess = { Result.success() }, onFailure = { Result.retry() })
    }
}
