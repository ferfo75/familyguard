package com.familyguard.child.ring

import android.app.KeyguardManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.getSystemService

/**
 * Se abre sola (vía notificación de pantalla completa) cuando un padre hace
 * sonar el teléfono a distancia, para que el chico entienda qué es ese
 * sonido y pueda pararlo — antes sonaba sin ninguna explicación y sin forma
 * de cortarlo antes de los 30s.
 */
class RingActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        showOverLockScreen()
        setContent {
            MaterialTheme {
                Surface(Modifier.fillMaxSize()) { RingScreen(onStop = { RingPlayer.stop(this); finish() }) }
            }
        }
    }

    private fun showOverLockScreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
            getSystemService<KeyguardManager>()?.requestDismissKeyguard(this, null)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                    android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            )
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        // Si cierran esta pantalla de otra forma (botón atrás, etc.) el
        // sonido también se corta: no tendría sentido que siguiera sonando
        // con la pantalla ya cerrada.
        RingPlayer.stop(this)
    }
}

@Composable
private fun RingScreen(onStop: () -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("🔔", style = MaterialTheme.typography.displayLarge)
        Spacer(Modifier.height(16.dp))
        Text(
            "¡Tus papás te están llamando!",
            style = MaterialTheme.typography.headlineSmall,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            "Llamalos o contestales el mensaje para avisarles que estás bien.",
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(40.dp))
        Button(onClick = onStop, modifier = Modifier.fillMaxWidth(0.8f)) {
            Text("Dejar de sonar")
        }
    }
}
