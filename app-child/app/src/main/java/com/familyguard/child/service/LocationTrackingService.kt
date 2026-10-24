package com.familyguard.child.service

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.BatteryManager
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.familyguard.child.FamilyGuardChildApp
import com.familyguard.child.R
import com.familyguard.child.data.Prefs
import com.familyguard.child.network.ApiClient
import com.familyguard.child.network.ChildSocketManager
import com.familyguard.child.network.LocationPingRequest
import com.familyguard.child.ring.RingPlayer
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.Granularity
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Servicio en foreground que manda la ubicación del dispositivo al backend
 * cada [PING_INTERVAL_MS] mientras está habilitado el seguimiento. Debe
 * seguir vivo incluso con la app en background, por eso es un foreground
 * service con tipo "location" (requisito desde Android 14).
 */
class LocationTrackingService : Service() {

    private lateinit var fusedClient: FusedLocationProviderClient
    private lateinit var prefs: Prefs
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val locationCallback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            val location = result.lastLocation ?: return
            // hasSpeed() es false en equipos/fixes donde el GPS no pudo estimarla
            // (por ejemplo, parado quieto); en ese caso no mandamos un 0 falso.
            val speed = if (location.hasSpeed()) location.speed else null
            scope.launch { sendPing(location.latitude, location.longitude, location.accuracy, speed) }
        }
    }

    override fun onCreate() {
        super.onCreate()
        prefs = Prefs(applicationContext)
        fusedClient = LocationServices.getFusedLocationProviderClient(this)
        connectCommandSocket()
    }

    // Deja conectado el canal de comandos (por ahora, "hacer sonar") durante
    // toda la vida del servicio — así sigue andando aunque el chico cierre
    // la pantalla de la app, igual que el seguimiento de ubicación.
    private fun connectCommandSocket() {
        scope.launch {
            val token = prefs.deviceTokenOrNull() ?: return@launch
            ChildSocketManager.connectAndListenForRing(
                token,
                onRing = { RingPlayer.start(applicationContext) },
                onStopRing = { RingPlayer.stop(applicationContext) },
            )
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, buildNotification())
        startLocationUpdates()
        return START_STICKY
    }

    private fun startLocationUpdates() {
        // PRIORITY_HIGH_ACCURACY (usa GPS, no solo redes) porque algunos
        // equipos de entrada de gama, Motorola incluidos, dan ubicaciones muy
        // imprecisas o directamente no reportan con la prioridad "balanceada"
        // si el modo de ubicación del sistema no está en "Alta precisión".
        //
        // setMaxUpdateDelayMillis(PING_INTERVAL_MS) desactiva el "batching":
        // sin esto, Android puede juntar varias lecturas y entregarlas todas
        // juntas más tarde (o reentregar la más vieja del lote) para ahorrar
        // batería, que es exactamente el síntoma de "manda cada 1 minuto pero
        // siempre la misma posición vieja" que estamos viendo.
        // setMinUpdateDistanceMeters(0f) evita que Android descarte una
        // lectura nueva por considerar que "no se movió lo suficiente",
        // decisión que toma un sensor de movimiento aparte del GPS y que en
        // un bolsillo/mochila puede dar falsos negativos.
        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, PING_INTERVAL_MS)
            .setMinUpdateIntervalMillis(PING_INTERVAL_MS / 2)
            .setMaxUpdateDelayMillis(PING_INTERVAL_MS)
            .setMinUpdateDistanceMeters(0f)
            .setWaitForAccurateLocation(false)
            .setGranularity(Granularity.GRANULARITY_FINE)
            .build()
        try {
            fusedClient.requestLocationUpdates(request, locationCallback, mainLooper)
        } catch (_: SecurityException) {
            // El permiso de ubicación se retiró después de iniciado el servicio; se detiene solo.
            stopSelf()
        }
    }

    private suspend fun sendPing(lat: Double, lng: Double, accuracy: Float?, speedMs: Float?) {
        val api = ApiClient.create(prefs)
        runCatching {
            api.sendLocationPing(LocationPingRequest(lat, lng, accuracy, speedMs, readBatteryLevel()))
        }
    }

    private fun readBatteryLevel(): Int {
        val bm = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        return bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
    }

    private fun buildNotification(): Notification {
        // Abre SosActivity (no un broadcast mudo) para que, además de mandar
        // la ubicación al toque, el chico pueda opcionalmente grabar un
        // mensaje de voz corto.
        val sosIntent = Intent(this, com.familyguard.child.sos.SosActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        val sosPendingIntent = PendingIntent.getActivity(
            this, 0, sosIntent, PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, FamilyGuardChildApp.CHANNEL_TRACKING)
            .setContentTitle(getString(R.string.tracking_notification_title))
            .setContentText(getString(R.string.tracking_notification_text))
            .setSmallIcon(R.drawable.ic_tracking)
            .setOngoing(true)
            .addAction(R.drawable.ic_sos, getString(R.string.sos_action_label), sosPendingIntent)
            .build()
    }

    override fun onDestroy() {
        fusedClient.removeLocationUpdates(locationCallback)
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        private const val NOTIFICATION_ID = 1001
        private const val PING_INTERVAL_MS = 60_000L // 1 ping por minuto; ajustable según batería deseada

        fun start(context: Context) {
            context.startForegroundService(Intent(context, LocationTrackingService::class.java))
        }
    }
}
