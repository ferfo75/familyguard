package com.familyguard.parent.alerts

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import androidx.core.app.NotificationCompat
import com.familyguard.parent.MainActivity
import com.familyguard.parent.R

/** Un aviso para el padre. `kind` decide el sonido y la ventana: sos | msg | home | school | zone. */
data class FamilyAlert(
    val kind: String,
    val title: String,
    val body: String,
    val lat: Double? = null,
    val lng: Double? = null,
    val alertId: String? = null,
)

/**
 * Punto único por donde pasan los avisos (push y socket): arma la notificación con el
 * canal que corresponde (cada tipo tiene su propio sonido) y, si el celular lo permite,
 * abre una ventana emergente por encima de la app que se esté usando.
 */
object AlertCenter {
    const val CH_SOS = "sos_alarm"
    const val CH_SOS_QUIET = "sos_quiet"
    const val CH_MSG = "ev_msg"
    const val CH_HOME = "ev_home"
    const val CH_SCHOOL = "ev_school"
    const val CH_ZONE = "alerts"

    const val SOS_NOTIFICATION_ID = 9001

    private var lastSosId: String? = null
    private var lastSosAt = 0L

    fun ensureChannels(ctx: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = ctx.getSystemService(NotificationManager::class.java)

        fun sound(raw: Int): Uri = Uri.parse("android.resource://${ctx.packageName}/$raw")
        fun attrs(usage: Int) = AudioAttributes.Builder()
            .setUsage(usage).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()

        nm.createNotificationChannel(NotificationChannel(CH_SOS, "🆘 Emergencia (SOS)", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Alarma fuerte cuando un hijo/a toca el botón de ayuda."
            setSound(sound(R.raw.sos_alarm), attrs(AudioAttributes.USAGE_ALARM))
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 700, 300, 700, 300, 700)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            setBypassDnd(true)
        })
        nm.createNotificationChannel(NotificationChannel(CH_SOS_QUIET, "SOS (ya sonó)", NotificationManager.IMPORTANCE_LOW).apply {
            setSound(null, null)
        })
        nm.createNotificationChannel(NotificationChannel(CH_MSG, "Mensajes de tus hijos/as", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "\"Voy en camino\" y \"Llegué bien\"."
            setSound(sound(R.raw.msg_chime), attrs(AudioAttributes.USAGE_NOTIFICATION))
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 250, 150, 250)
        })
        nm.createNotificationChannel(NotificationChannel(CH_HOME, "Llegó a casa", NotificationManager.IMPORTANCE_HIGH).apply {
            setSound(sound(R.raw.home_arrival), attrs(AudioAttributes.USAGE_NOTIFICATION))
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 200, 120, 200, 120, 400)
        })
        nm.createNotificationChannel(NotificationChannel(CH_SCHOOL, "Llegó al colegio", NotificationManager.IMPORTANCE_HIGH).apply {
            setSound(sound(R.raw.school_arrival), attrs(AudioAttributes.USAGE_NOTIFICATION))
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 500, 200, 500)
        })
        nm.createNotificationChannel(NotificationChannel(CH_ZONE, "Alertas de la familia", NotificationManager.IMPORTANCE_HIGH))
    }

    private fun channelFor(kind: String) = when (kind) {
        "sos" -> CH_SOS
        "msg" -> CH_MSG
        "home" -> CH_HOME
        "school" -> CH_SCHOOL
        else -> CH_ZONE
    }

    fun popupIntent(ctx: Context, a: FamilyAlert): Intent =
        Intent(ctx, AlertPopupActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NO_USER_ACTION)
            putExtra("kind", a.kind)
            putExtra("title", a.title)
            putExtra("body", a.body)
            a.lat?.let { putExtra("lat", it) }
            a.lng?.let { putExtra("lng", it) }
            putExtra("alertId", a.alertId)
        }

    fun handle(ctx: Context, a: FamilyAlert) {
        val app = ctx.applicationContext
        if (a.kind == "sos") {
            // Llega por push y por socket a la vez: se atiende una sola vez por alerta.
            val now = System.currentTimeMillis()
            if (a.alertId != null && a.alertId == lastSosId && now - lastSosAt < 10 * 60_000) return
            lastSosId = a.alertId
            lastSosAt = now
        }
        ensureChannels(app)
        val nm = app.getSystemService(NotificationManager::class.java)
        val isSos = a.kind == "sos"
        val popup = popupIntent(app, a)

        val contentIntent = PendingIntent.getActivity(
            app, a.kind.hashCode(), if (isSos) popup else Intent(app, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val b = NotificationCompat.Builder(app, channelFor(a.kind))
            .setContentTitle(a.title)
            .setContentText(a.body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(a.body))
            .setSmallIcon(R.drawable.ic_notification)
            .setAutoCancel(!isSos)
            .setContentIntent(contentIntent)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(if (isSos) NotificationCompat.PRIORITY_MAX else NotificationCompat.PRIORITY_HIGH)
        if (isSos) {
            b.setCategory(NotificationCompat.CATEGORY_ALARM)
            b.setFullScreenIntent(contentIntent, true)
            b.setOngoing(true)
        }
        val n = b.build()
        // El sonido del canal se repite hasta que alguien lo atienda (como una alarma).
        if (isSos) n.flags = n.flags or Notification.FLAG_INSISTENT
        val id = if (isSos) SOS_NOTIFICATION_ID else System.currentTimeMillis().toInt()
        runCatching { nm.notify(id, n) }

        // Ventana por encima de cualquier app: Android solo la deja abrir desde segundo plano
        // si la app tiene el permiso "Mostrar sobre otras apps" (ver Más → Alertas en este celular).
        // Sin ese permiso queda la notificación flotante y, con la pantalla apagada, la pantalla completa.
        val canOverlay = Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(app)
        if (canOverlay) runCatching { app.startActivity(popup) }
    }

    /** Apaga el aviso fuerte y deja uno silencioso para volver a la ubicación. */
    fun quietSos(ctx: Context, a: FamilyAlert) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        ensureChannels(ctx)
        val pi = PendingIntent.getActivity(
            ctx, 77, popupIntent(ctx, a).apply { putExtra("quiet", true) },
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val n = NotificationCompat.Builder(ctx, CH_SOS_QUIET)
            .setContentTitle(a.title).setContentText("Tocá para ver dónde está.")
            .setSmallIcon(R.drawable.ic_notification).setContentIntent(pi).setAutoCancel(true).build()
        nm.cancel(SOS_NOTIFICATION_ID)
        nm.notify(SOS_NOTIFICATION_ID, n)
    }
}

/** La sirena de emergencia: se repite a todo volumen por el canal de alarmas hasta que se silencia. */
object SosAlarm {
    private var player: MediaPlayer? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var savedVolume = -1

    val isPlaying get() = player != null

    fun start(ctx: Context) {
        if (player != null) return
        val app = ctx.applicationContext
        runCatching {
            val am = app.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            savedVolume = am.getStreamVolume(AudioManager.STREAM_ALARM)
            am.setStreamVolume(AudioManager.STREAM_ALARM, am.getStreamMaxVolume(AudioManager.STREAM_ALARM), 0)
        }
        runCatching {
            player = MediaPlayer().apply {
                setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
                setDataSource(app, Uri.parse("android.resource://${app.packageName}/${R.raw.sos_alarm}"))
                isLooping = true
                prepare()
                start()
            }
        }
        runCatching {
            val pm = app.getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "familyguard:sos").apply { acquire(10 * 60_000L) }
        }
        runCatching {
            val pattern = longArrayOf(0, 700, 300, 700, 300)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                (app.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
                    .vibrate(VibrationEffect.createWaveform(pattern, 0))
            } else {
                @Suppress("DEPRECATION")
                (app.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator).vibrate(VibrationEffect.createWaveform(pattern, 0))
            }
        }
    }

    fun stop(ctx: Context) {
        val app = ctx.applicationContext
        runCatching { player?.stop(); player?.release() }
        player = null
        runCatching { if (wakeLock?.isHeld == true) wakeLock?.release() }
        wakeLock = null
        runCatching {
            if (savedVolume >= 0) {
                (app.getSystemService(Context.AUDIO_SERVICE) as AudioManager).setStreamVolume(AudioManager.STREAM_ALARM, savedVolume, 0)
            }
        }
        savedVolume = -1
        runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                (app.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator.cancel()
            } else {
                @Suppress("DEPRECATION")
                (app.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator).cancel()
            }
        }
    }
}
