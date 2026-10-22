package com.familyguard.parent.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
                    Row {
                        Button(onClick = { NavigationIntents.openGoogleMapsDirections(context, alert.lat, alert.lng) }) {
                            Text("Ir hasta ahí")
                        }
                        if (alert.resolvedAt == null) {
                            Spacer(Modifier.width(8.dp))
                            TextButton(onClick = {
                                scope.launch {
                                    val api = ApiClient.create(prefs)
                                    runCatching { api.resolveSosAlert(alert.id) }
                                    alerts = alerts.map { if (it.id == alert.id) it.copy(resolvedAt = "ahora") else it }
                                }
                            }) { Text("Marcar resuelta") }
                        }
                    }
                }
            }
        }
    }
}
