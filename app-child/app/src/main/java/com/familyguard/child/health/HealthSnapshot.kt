package com.familyguard.child.health

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.BatteryManager
import androidx.core.content.ContextCompat
import androidx.core.location.LocationManagerCompat
import com.familyguard.child.BuildConfig
import com.familyguard.child.battery.BatteryOptimization
import com.familyguard.child.network.HealthDto

/**
 * Foto del estado del teléfono en este momento. Son justo las tres cosas que,
 * cuando fallan, hacen que un teléfono (Motorola sobre todo) deje de reportar:
 * batería restringida por el fabricante, permiso de ubicación "todo el tiempo"
 * y GPS del sistema apagado.
 */
object HealthSnapshot {

    fun collect(context: Context): HealthDto {
        val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        val backgroundGranted = ContextCompat.checkSelfPermission(
            context, Manifest.permission.ACCESS_BACKGROUND_LOCATION,
        ) == PackageManager.PERMISSION_GRANTED
        return HealthDto(
            batteryUnrestricted = BatteryOptimization.isIgnoringBatteryOptimizations(context),
            backgroundLocation = backgroundGranted,
            locationEnabled = LocationManagerCompat.isLocationEnabled(locationManager),
            appVersion = BuildConfig.VERSION_NAME,
        )
    }

    /** Porcentaje de batería, o null si el sistema no lo informa (así no se manda un 0 falso). */
    fun batteryLevel(context: Context): Int? = runCatching {
        val bm = context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY).takeIf { it in 0..100 }
    }.getOrNull()
}
