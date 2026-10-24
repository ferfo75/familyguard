package com.familyguard.child.movement

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.google.android.gms.location.ActivityRecognitionResult
import com.google.android.gms.location.DetectedActivity

/** Recibe las detecciones de Google Play Services (caminando, en auto, en
 * bici, quieto, corriendo) y guarda la más probable, si está suficientemente
 * segura. Detecciones de baja confianza o "desconocido" se ignoran: mejor no
 * mostrar nada que mostrar algo probablemente equivocado. */
class MovementReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (!ActivityRecognitionResult.hasResult(intent)) return
        val result = ActivityRecognitionResult.extractResult(intent) ?: return
        val best = result.mostProbableActivity
        if (best.confidence < MIN_CONFIDENCE) return

        MovementState.current = when (best.type) {
            DetectedActivity.IN_VEHICLE -> "vehicle"
            DetectedActivity.ON_BICYCLE -> "bicycle"
            DetectedActivity.RUNNING -> "running"
            DetectedActivity.WALKING, DetectedActivity.ON_FOOT -> "walking"
            DetectedActivity.STILL -> "still"
            else -> return // TILTING/UNKNOWN: dejamos el último valor conocido en vez de borrarlo
        }
    }

    companion object {
        private const val MIN_CONFIDENCE = 60
    }
}
