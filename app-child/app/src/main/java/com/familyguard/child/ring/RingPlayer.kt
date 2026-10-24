package com.familyguard.child.ring

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Handler
import android.os.Looper
import androidx.core.app.NotificationCompat
import com.familyguard.child.FamilyGuardChildApp

/**
 * Hace sonar el teléfono fuerte aunque esté en silencio o vibrador: usa el
 * canal de ALARMA (USAGE_ALARM), que Android trata distinto del volumen de
 * notificaciones/llamadas — es el mismo mecanismo que "Encontrar mi
 * dispositivo". Suena durante [DURATION_MS] o hasta que el chico lo pare.
 *
 * Además dispara una notificación de pantalla completa (el mismo mecanismo
 * que usa una llamada entrante o una alarma) para que [RingActivity] se
 * abra sola y explique qué está pasando, incluso si esto se dispara desde
 * un worker en segundo plano con la pantalla apagada.
 */
object RingPlayer {
    private const val DURATION_MS = 30_000L
    private const val NOTIFICATION_ID = 4821
    private var player: MediaPlayer? = null

    fun start(context: Context) {
        stop(context) // por si ya había uno sonando
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
        showNotification(context)
        Handler(Looper.getMainLooper()).postDelayed({ stop(context) }, DURATION_MS)
    }

    fun stop(context: Context) {
        runCatching {
            player?.stop()
            player?.release()
        }
        player = null
        runCatching {
            context.getSystemService(NotificationManager::class.java)?.cancel(NOTIFICATION_ID)
        }
    }

    private fun showNotification(context: Context) {
        val fullScreenIntent = Intent(context, RingActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val fullScreenPendingIntent = PendingIntent.getActivity(
            context, 0, fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val stopPendingIntent = PendingIntent.getBroadcast(
            context, 0, Intent(context, RingStopReceiver::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, FamilyGuardChildApp.CHANNEL_RING)
            .setSmallIcon(android.R.drawable.ic_lock_silent_mode_off)
            .setContentTitle("¡Tus papás te están llamando!")
            .setContentText("Tocá para ver el mensaje, o Detener para parar el sonido.")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setFullScreenIntent(fullScreenPendingIntent, true)
            .setContentIntent(fullScreenPendingIntent)
            .addAction(0, "Detener", stopPendingIntent)
            .setAutoCancel(true)
            .setOngoing(true)
            .build()
        runCatching {
            context.getSystemService(NotificationManager::class.java)
                ?.notify(NOTIFICATION_ID, notification)
        }
    }
}
