package com.familyguard.parent.ui

import android.Manifest
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.app.NotificationManagerCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.compose.ui.platform.LocalLifecycleOwner
import com.familyguard.parent.alerts.AlertCenter
import com.familyguard.parent.alerts.FamilyAlert

private data class Step(val title: String, val why: String, val ok: Boolean, val action: () -> Unit)

/**
 * "Alertas en este celular": lo que hay que permitir para que el SOS suene fuerte y aparezca
 * por encima de cualquier app, más botones para probar los cuatro sonidos.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun AlertsSetupSection() {
    val ctx = LocalContext.current
    var tick by remember { mutableIntStateOf(0) }
    // Al volver de los ajustes del sistema se vuelve a mirar qué quedó permitido.
    val owner = LocalLifecycleOwner.current
    DisposableEffect(owner) {
        val obs = LifecycleEventObserver { _, e -> if (e == Lifecycle.Event.ON_RESUME) tick++ }
        owner.lifecycle.addObserver(obs)
        onDispose { owner.lifecycle.removeObserver(obs) }
    }
    val notifLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { tick++ }

    @Suppress("UNUSED_EXPRESSION") tick
    val nm = ctx.getSystemService(NotificationManager::class.java)
    val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
    val pkg = ctx.packageName

    fun open(intent: Intent) {
        runCatching { ctx.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
            .onFailure { runCatching { ctx.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$pkg")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } }
    }

    val steps = buildList {
        add(Step("Notificaciones", "Sin esto no llega ningún aviso.", NotificationManagerCompat.from(ctx).areNotificationsEnabled()) {
            if (Build.VERSION.SDK_INT >= 33) notifLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            else open(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg))
        })
        add(Step("Mostrar sobre otras apps", "Para que el SOS aparezca encima de lo que estés usando.", Settings.canDrawOverlays(ctx)) {
            open(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$pkg")))
        })
        if (Build.VERSION.SDK_INT >= 34) {
            add(Step("Pantalla completa con el celular bloqueado", "Para que el SOS encienda la pantalla.", nm.canUseFullScreenIntent()) {
                open(Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:$pkg")))
            })
        }
        add(Step("Sonar aunque esté en \"No molestar\"", "Para que la alarma de SOS no se silencie.", nm.isNotificationPolicyAccessGranted) {
            open(Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS))
        })
        add(Step("Sin ahorro de batería", "Evita que el celular \"duerma\" la app y se pierdan avisos.", pm.isIgnoringBatteryOptimizations(pkg)) {
            open(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$pkg")))
        })
    }
    val allOk = steps.all { it.ok }

    Text("Alertas en este celular", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    Spacer(Modifier.height(8.dp))
    Card(
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, if (allOk) MaterialTheme.colorScheme.outlineVariant else MaterialTheme.colorScheme.error),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(14.dp)) {
            Text(
                if (allOk) "Todo listo: el SOS va a sonar fuerte y aparecer encima de cualquier app."
                else "Faltan permisos para que el SOS suene y aparezca encima de cualquier app. Tocá cada uno y activalo.",
                style = MaterialTheme.typography.bodyMedium,
            )
            Spacer(Modifier.height(10.dp))
            steps.forEach { st ->
                Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(if (st.ok) "✅" else "⚠️")
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) {
                        Text(st.title, style = MaterialTheme.typography.titleSmall)
                        Text(st.why, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    if (!st.ok) {
                        Spacer(Modifier.width(8.dp))
                        Button(onClick = st.action) { Text("Permitir") }
                    }
                }
            }
            Spacer(Modifier.height(12.dp))
            Text("Probar los sonidos", style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.height(6.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = {
                    AlertCenter.handle(ctx, FamilyAlert("sos", "🆘 Prueba pidió ayuda", "Esto es una prueba del botón de pánico.", alertId = "test-" + System.currentTimeMillis()))
                }) { Text("🆘 SOS") }
                OutlinedButton(onClick = {
                    AlertCenter.handle(ctx, FamilyAlert("msg", "🚶 Prueba va en camino", "Llega en 10 min"))
                }) { Text("💬 Mensaje") }
                OutlinedButton(onClick = {
                    AlertCenter.handle(ctx, FamilyAlert("home", "🏠 Prueba llegó a casa", "Prueba entró a \"Casa\""))
                }) { Text("🏠 Casa") }
                OutlinedButton(onClick = {
                    AlertCenter.handle(ctx, FamilyAlert("school", "🏫 Prueba llegó al colegio", "Prueba entró a \"Colegio\""))
                }) { Text("🏫 Colegio") }
            }
        }
    }
}
