@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package com.familyguard.parent.ui

import android.media.MediaPlayer
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.familyguard.parent.data.Prefs
import com.familyguard.parent.network.ApiClient
import com.familyguard.parent.network.SosAlert
import com.familyguard.parent.util.NavigationIntents
import kotlinx.coroutines.launch
import java.io.File

/** Historial de alertas de pánico, más recientes primero. */
@Composable
fun SosScreen(prefs: Prefs) {
    var alerts by remember { mutableStateOf<List<SosAlert>>(emptyList()) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        val api = ApiClient.create(prefs)
        runCatching { api.getSosAlerts() }.getOrNull()?.body()?.let { alerts = it.alerts }
    }

    if (alerts.isEmpty()) {
        Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center) {
            Text("No hubo alertas de pánico.")
        }
        return
    }

    val context = LocalContext.current
    LazyColumn(Modifier.fillMaxSize().padding(16.dp)) {
        items(alerts) { alert ->
            Card(Modifier.padding(vertical = 6.dp)) {
                Column(Modifier.padding(12.dp)) {
                    Text("🆘 ${alert.childName}", style = MaterialTheme.typography.titleMedium)
                    Text(alert.message ?: "Tocó el botón de pánico.", style = MaterialTheme.typography.bodyMedium)
                    Text(alert.createdAt, style = MaterialTheme.typography.bodySmall)
                    if (alert.resolvedAt != null) {
                        Text("Resuelta", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                    }
                    Spacer(Modifier.height(8.dp))
                    // FlowRow en vez de Row: si los botones no entran en el
                    // ancho de la pantalla, pasan solos a una segunda línea en
                    // vez de apretarse unos contra otros (eso era el bug: con
                    // 3-4 botones en un Row común, los de más a la derecha
                    // quedaban invisibles, apretados a casi cero ancho).
                    androidx.compose.foundation.layout.FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Button(onClick = { NavigationIntents.openGoogleMapsDirections(context, alert.lat, alert.lng) }) {
                            Text("Ir hasta ahí")
                        }
                        if (!alert.audioClipBase64.isNullOrEmpty()) {
                            OutlinedButton(onClick = { playAudioClip(context, alert.audioClipBase64) }) {
                                Icon(Icons.Filled.PlayArrow, contentDescription = null)
                                Spacer(Modifier.width(4.dp))
                                Text("Escuchar")
                            }
                        }
                        if (alert.resolvedAt == null) {
                            OutlinedButton(onClick = {
                                scope.launch {
                                    val api = ApiClient.create(prefs)
                                    val ok = runCatching { api.resolveSosAlert(alert.id) }.getOrNull()?.isSuccessful == true
                                    if (ok) alerts = alerts.map { if (it.id == alert.id) it.copy(resolvedAt = "ahora") else it }
                                }
                            }) { Text("Marcar resuelta") }
                        }
                        OutlinedButton(
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                            onClick = {
                                scope.launch {
                                    val api = ApiClient.create(prefs)
                                    val ok = runCatching { api.deleteSosAlert(alert.id) }.getOrNull()?.let { it.isSuccessful || it.code() == 204 } == true
                                    if (ok) alerts = alerts.filterNot { it.id == alert.id }
                                }
                            }
                        ) { Text("Borrar") }
                    }
                }
            }
        }
    }
}

private fun playAudioClip(context: android.content.Context, base64: String) {
    runCatching {
        val bytes = android.util.Base64.decode(base64, android.util.Base64.NO_WRAP)
        val file = File.createTempFile("sos_audio", ".m4a", context.cacheDir).apply { writeBytes(bytes) }
        MediaPlayer().apply {
            setDataSource(file.absolutePath)
            setOnCompletionListener { release(); file.delete() }
            prepare()
            start()
        }
    }
}
