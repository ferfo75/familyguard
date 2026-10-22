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
import com.familyguard.child.network.LocationPingRequest
import com.familyguard.child.sos.SosActionReceiver
import com.google.android.gms.location.FusedLocationProviderClient
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
            scope.launch { sendPing(location.latitude, location.longitude, location.accuracy) }
        }
    }

    override fun onCreate() {
        super.onCreate()
        prefs = Prefs(applicationContext)
        fusedClient = LocationServices.getFusedLocationProviderClient(this)
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
        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, PING_INTERVAL_MS)
            .setMinUpdateIntervalMillis(PING_INTERVAL_MS / 2)
            .build()
        try {
            fusedClient.requestLocationUpdates(request, locationCallback, mainLooper)
        } catch (_: SecurityException) {
            // El permiso de ubicación se retiró después de iniciado el servicio; se detiene solo.
            stopSelf()
        }
    }

    private suspend fun sendPing(lat: Double, lng: Double, accuracy: Float?) {
        val api = ApiClient.create(prefs)
        runCatching {
            api.sendLocationPing(LocationPingRequest(lat, lng, accuracy, readBatteryLevel()))
        }
    }

    private fun readBatteryLevel(): Int {
        val bm = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        return bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
    }

    private fun buildNotification(): Notification {
        val sosIntent = Intent(this, SosActionReceiver::class.java)
        val sosPendingIntent = PendingIntent.getBroadcast(
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
