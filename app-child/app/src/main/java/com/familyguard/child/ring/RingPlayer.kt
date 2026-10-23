package com.familyguard.child.ring

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Handler
import android.os.Looper

/**
 * Hace sonar el teléfono fuerte aunque esté en silencio o vibrador: usa el
 * canal de ALARMA (USAGE_ALARM), que Android trata distinto del volumen de
 * notificaciones/llamadas — es el mismo mecanismo que "Encontrar mi
 * dispositivo". Suena durante [DURATION_MS] y para solo.
 */
object RingPlayer {
    private const val DURATION_MS = 30_000L
    private var player: MediaPlayer? = null

    fun start(context: Context) {
        stop() // por si ya había uno sonando
        runCatching {
            val uri = RingtoneManager.getActualDefaultRingtoneUri(context, RingtoneManager.TYPE_ALARM)
                ?: RingtoneManager.getActualDefaultRingtoneUri(context, RingtoneManager.TYPE_RINGTONE)
                ?: return

            player = MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                setDataSource(context, uri)
                isLooping = true
                prepare()
                start()
            }
        }
        Handler(Looper.getMainLooper()).postDelayed({ stop() }, DURATION_MS)
    }

    fun stop() {
        runCatching {
            player?.stop()
            player?.release()
        }
        player = null
    }
}
