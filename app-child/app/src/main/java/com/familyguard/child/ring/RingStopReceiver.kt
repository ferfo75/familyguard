package com.familyguard.child.ring

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Botón "Detener" de la notificación de "hacer sonar", para pararlo sin
 * necesidad de que se haya llegado a abrir [RingActivity]. */
class RingStopReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        RingPlayer.stop(context)
    }
}
