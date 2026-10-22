package com.familyguard.child.battery

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings

/**
 * Motorola (igual que la mayoría de los fabricantes: Samsung, Xiaomi, etc.)
 * trae su propio gestor de batería que puede matar un foreground service de
 * ubicación aunque Android ya lo haya marcado como "no optimizado" a nivel
 * de sistema. Por eso acá se intenta por las dos vías:
 *
 * 1. El diálogo estándar de Android para ignorar Doze/App Standby
 *    ([requestIgnoreBatteryOptimizations]). Funciona en la mayoría de los
 *    equipos, Motorola incluido.
 * 2. Si el usuario lo rechaza o el fabricante bloquea el diálogo estándar,
 *    [openManufacturerBatterySettings] lleva directo a la pantalla de
 *    batería por app, donde Motorola muestra la opción "Sin restricciones".
 */
object BatteryOptimization {

    fun isIgnoringBatteryOptimizations(context: Context): Boolean {
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        return pm.isIgnoringBatteryOptimizations(context.packageName)
    }

    /** Dispara el diálogo del sistema. Puede no hacer nada en equipos que lo bloquean. */
    fun requestIgnoreBatteryOptimizations(context: Context) {
        if (isIgnoringBatteryOptimizations(context)) return
        val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
            data = Uri.parse("package:${context.packageName}")
        }
        runCatching { context.startActivity(intent) }
    }

    /** Fallback universal: pantalla de "Optimización de batería" del sistema,
     * donde el usuario busca FamilyGuard a mano y elige "No optimizar"/"Sin restricciones". */
    fun openSystemBatterySettings(context: Context) {
        val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
        runCatching { context.startActivity(intent) }
    }
}
