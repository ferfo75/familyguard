package com.familyguard.parent.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.familyguard.parent.data.Prefs
import com.familyguard.parent.network.ApiClient
import com.familyguard.parent.network.ChildLatest
import com.familyguard.parent.network.SetBlockedAppRequest
import com.familyguard.parent.network.UsageAppRecord
import kotlinx.coroutines.launch

/** Panel de uso de apps del día y control de bloqueo/límite por app. */
@Composable
fun UsageScreen(prefs: Prefs, child: ChildLatest) {
    var apps by remember { mutableStateOf<List<UsageAppRecord>>(emptyList()) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(child.childDeviceId) {
        val api = ApiClient.create(prefs)
        runCatching { api.getUsageSummary(child.childDeviceId) }.getOrNull()?.body()?.let { apps = it.apps }
    }

    if (apps.isEmpty()) {
        Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center) {
            Text("Todavía no hay datos de uso de hoy para ${child.childName}.")
        }
        return
    }

    val maxMinutes = apps.maxOf { it.usageMinutes }.coerceAtLeast(1)
    LazyColumn(Modifier.fillMaxSize().padding(16.dp)) {
        items(apps) { app ->
            UsageRow(app, maxMinutes, onBlock = {
                scope.launch {
                    val api = ApiClient.create(prefs)
                    runCatching { api.setBlockedApp(child.childDeviceId, SetBlockedAppRequest(app.packageName, null)) }
                }
            })
            Spacer(Modifier.height(12.dp))
        }
    }
}

@Composable
private fun UsageRow(app: UsageAppRecord, maxMinutes: Int, onBlock: () -> Unit) {
    Column {
        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            Text(app.appName, modifier = Modifier.weight(1f))
            Text("${app.usageMinutes} min")
            TextButton(onClick = onBlock) { Text("Bloquear") }
        }
        LinearProgressIndicator(
            progress = { app.usageMinutes.toFloat() / maxMinutes },
            modifier = Modifier.fillMaxWidth(),
        )
    }
}
