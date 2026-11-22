package com.familyguard.parent.alerts

import android.app.KeyguardManager
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.familyguard.parent.MainActivity
import com.familyguard.parent.ui.theme.FamilyGuardParentTheme
import com.familyguard.parent.util.NavigationIntents
import kotlinx.coroutines.delay

/**
 * Ventana de aviso por encima de cualquier otra app (y de la pantalla de bloqueo).
 * SOS: pantalla completa roja con la sirena sonando hasta que se la silencia.
 * Resto (mensaje, llegó a casa, llegó al colegio): tarjeta chica que se cierra sola.
 */
class AlertPopupActivity : ComponentActivity() {

    private var alert by mutableStateOf(FamilyAlert("zone", "", ""))
    private var silenced by mutableStateOf(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,
            )
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        readIntent(intent)

        setContent {
            FamilyGuardParentTheme {
                val a = alert
                if (a.kind == "sos") {
                    SosFullScreen(
                        a, silenced,
                        onSilence = { silence() },
                        onGo = {
                            silence()
                            if (a.lat != null && a.lng != null) NavigationIntents.openGoogleMapsDirections(this, a.lat, a.lng)
                            finish()
                        },
                        onOpenApp = {
                            silence()
                            startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                            finish()
                        },
                        onClose = { silence(); finish() },
                    )
                    BackHandler { silence(); finish() }
                } else {
                    EventCard(
                        a,
                        onOpen = {
                            startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                            finish()
                        },
                        onClose = { finish() },
                    )
                    LaunchedEffect(a.title, a.body) { delay(20_000); finish() }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        readIntent(intent)
    }

    private fun readIntent(i: Intent) {
        val kind = i.getStringExtra("kind") ?: "zone"
        alert = FamilyAlert(
            kind = kind,
            title = i.getStringExtra("title") ?: "",
            body = i.getStringExtra("body") ?: "",
            lat = if (i.hasExtra("lat")) i.getDoubleExtra("lat", 0.0) else null,
            lng = if (i.hasExtra("lng")) i.getDoubleExtra("lng", 0.0) else null,
            alertId = i.getStringExtra("alertId"),
        )
        if (kind == "sos" && !i.getBooleanExtra("quiet", false)) {
            silenced = false
            // La notificación sonaba por su cuenta; ahora suena la sirena de acá, una sola.
            val nm = getSystemService(NotificationManager::class.java)
            nm.cancel(AlertCenter.SOS_NOTIFICATION_ID)
            SosAlarm.start(this)
        } else {
            silenced = true
        }
    }

    private fun silence() {
        SosAlarm.stop(this)
        silenced = true
        // Queda una notificación silenciosa para volver a ver dónde está.
        AlertCenter.quietSos(this, alert)
    }

    override fun onDestroy() {
        if (isFinishing) SosAlarm.stop(this)
        super.onDestroy()
    }
}

private val SosRed = Color(0xFFB3261E)

@Composable
private fun SosFullScreen(
    a: FamilyAlert,
    silenced: Boolean,
    onSilence: () -> Unit,
    onGo: () -> Unit,
    onOpenApp: () -> Unit,
    onClose: () -> Unit,
) {
    Box(Modifier.fillMaxSize().background(SosRed)) {
        Column(
            Modifier.fillMaxSize().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text("🆘", fontSize = 72.sp)
            Spacer(Modifier.height(12.dp))
            Text("EMERGENCIA", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold, letterSpacing = 4.sp)
            Spacer(Modifier.height(8.dp))
            Text(a.title.removePrefix("🆘").trim(), color = Color.White, fontSize = 30.sp, fontWeight = FontWeight.ExtraBold, textAlign = TextAlign.Center)
            Spacer(Modifier.height(8.dp))
            Text(a.body, color = Color.White.copy(alpha = .92f), fontSize = 18.sp, textAlign = TextAlign.Center)
            Spacer(Modifier.height(32.dp))
            if (!silenced) {
                Button(
                    onClick = onSilence,
                    modifier = Modifier.fillMaxWidth().height(60.dp),
                    shape = RoundedCornerShape(18.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color.White, contentColor = SosRed),
                ) { Text("Silenciar alarma", fontSize = 20.sp, fontWeight = FontWeight.Bold) }
                Spacer(Modifier.height(12.dp))
            }
            if (a.lat != null && a.lng != null) {
                Button(
                    onClick = onGo,
                    modifier = Modifier.fillMaxWidth().height(56.dp),
                    shape = RoundedCornerShape(18.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF33261C), contentColor = Color.White),
                ) { Text("Ir hasta ahí", fontSize = 18.sp) }
                Spacer(Modifier.height(12.dp))
            }
            OutlinedButton(
                onClick = onOpenApp,
                modifier = Modifier.fillMaxWidth().height(52.dp),
                shape = RoundedCornerShape(18.dp),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
            ) { Text("Abrir FamilyGuard") }
            Spacer(Modifier.height(8.dp))
            OutlinedButton(
                onClick = onClose,
                modifier = Modifier.fillMaxWidth().height(48.dp),
                shape = RoundedCornerShape(18.dp),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
            ) { Text("Cerrar") }
        }
    }
}

@Composable
private fun EventCard(a: FamilyAlert, onOpen: () -> Unit, onClose: () -> Unit) {
    val (accent, emoji) = when (a.kind) {
        "home" -> Color(0xFF3D7A4A) to "🏠"
        "school" -> Color(0xFFB8791A) to "🏫"
        "msg" -> Color(0xFFC2562B) to "💬"
        else -> Color(0xFF33261C) to "📍"
    }
    // Fondo apenas oscurecido: se sigue viendo la app de abajo. Tocar afuera cierra.
    Box(
        Modifier.fillMaxSize().background(Color.Black.copy(alpha = .35f)).padding(24.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            Modifier.fillMaxWidth().background(Color(0xFFF7F1E8), RoundedCornerShape(28.dp)).padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(Modifier.background(accent.copy(alpha = .15f), RoundedCornerShape(50)).padding(16.dp)) { Text(emoji, fontSize = 44.sp) }
            Spacer(Modifier.height(14.dp))
            Text(a.title, fontSize = 22.sp, fontWeight = FontWeight.ExtraBold, color = Color(0xFF33261C), textAlign = TextAlign.Center)
            if (a.body.isNotBlank()) {
                Spacer(Modifier.height(6.dp))
                Text(a.body, fontSize = 16.sp, color = Color(0xFF33261C).copy(alpha = .8f), textAlign = TextAlign.Center)
            }
            Spacer(Modifier.height(20.dp))
            Button(
                onClick = onOpen, modifier = Modifier.fillMaxWidth().height(50.dp), shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.buttonColors(containerColor = accent),
            ) { Text("Abrir FamilyGuard") }
            Spacer(Modifier.height(8.dp))
            OutlinedButton(onClick = onClose, modifier = Modifier.fillMaxWidth().height(46.dp), shape = RoundedCornerShape(16.dp)) { Text("Cerrar") }
        }
    }
}
