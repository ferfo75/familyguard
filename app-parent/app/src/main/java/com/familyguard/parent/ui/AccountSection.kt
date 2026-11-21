package com.familyguard.parent.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.familyguard.parent.data.Prefs
import com.familyguard.parent.network.AdultInfo
import com.familyguard.parent.network.AdultInviteResponse
import com.familyguard.parent.network.AdultsResponse
import com.familyguard.parent.network.ApiClient
import com.familyguard.parent.network.ApiResult
import com.familyguard.parent.network.SocketManager
import com.familyguard.parent.network.callWithRetry
import com.familyguard.parent.push.PushRegistration
import kotlinx.coroutines.launch

/** "Mi cuenta": quién está ingresado en este celular, cerrar sesión y los adultos de la familia. */
@Composable
fun AccountSection(prefs: Prefs) {
    val scope = rememberCoroutineScope()
    val name by prefs.nameFlow.collectAsState(initial = null)
    var adults by remember { mutableStateOf<AdultsResponse?>(null) }
    var invite by remember { mutableStateOf<AdultInviteResponse?>(null) }
    var message by remember { mutableStateOf<String?>(null) }
    var confirmLogout by remember { mutableStateOf(false) }
    var toRemove by remember { mutableStateOf<AdultInfo?>(null) }
    var busy by remember { mutableStateOf(false) }

    val load: suspend () -> Unit = {
        val r = callWithRetry(attempts = 1) { ApiClient.create(prefs).getAdults() }
        if (r is ApiResult.Ok) adults = r.value
    }
    LaunchedEffect(Unit) { load() }

    Text("Mi cuenta", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    Spacer(Modifier.height(8.dp))
    Card(
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(16.dp)) {
            Text("Ingresaste como", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(name ?: "…", style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(12.dp))
            OutlinedButton(onClick = { confirmLogout = true }, modifier = Modifier.fillMaxWidth()) { Text("Cerrar sesión / cambiar de usuario") }
        }
    }

    Spacer(Modifier.height(18.dp))
    Text("Adultos de la familia", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    Spacer(Modifier.height(8.dp))
    Card(
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(16.dp)) {
            val a = adults
            if (a == null) {
                Text("Cargando…", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                Text("${a.owner.name} (cuenta principal)", style = MaterialTheme.typography.bodyLarge)
                a.adults.forEach { adult ->
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                        Column(Modifier.weight(1f)) {
                            Text(adult.name, style = MaterialTheme.typography.bodyLarge)
                            Text(adult.email, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        if (a.me.owner) TextButton(onClick = { toRemove = adult }) { Text("Quitar") }
                    }
                }
                if (a.adults.isEmpty()) {
                    Text("Todavía no hay otros adultos. Cada uno ingresa con su propio email y ve a los mismos hijos.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Spacer(Modifier.height(12.dp))
            Button(
                enabled = !busy,
                onClick = {
                    busy = true
                    message = null
                    scope.launch {
                        val r = callWithRetry(attempts = 2) { ApiClient.create(prefs).inviteAdult() }
                        busy = false
                        when {
                            r is ApiResult.Ok -> invite = r.value
                            r is ApiResult.Failure && r.detail == "HTTP 409" -> message = "Ya hay 4 adultos sumados: es el máximo."
                            r is ApiResult.Failure -> message = r.userMessage()
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            ) { Text(if (busy) "Un momento…" else "Invitar a otro adulto") }
            message?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 8.dp)) }
        }
    }

    invite?.let { inv ->
        AlertDialog(
            onDismissRequest = { invite = null },
            title = { Text("Código de invitación") },
            text = {
                Column {
                    Text(inv.code, fontSize = 34.sp, style = MaterialTheme.typography.headlineMedium)
                    Spacer(Modifier.height(8.dp))
                    Text("Sirve una sola vez y vence en 1 hora. En el celular de la otra persona: abrir FamilyGuard → \"Tengo un código de invitación\", y crear su cuenta con su propio email.")
                }
            },
            confirmButton = { TextButton(onClick = { invite = null; scope.launch { load() } }) { Text("Listo") } },
        )
    }

    toRemove?.let { adult ->
        AlertDialog(
            onDismissRequest = { toRemove = null },
            title = { Text("¿Quitar a ${adult.name}?") },
            text = { Text("Va a dejar de ver a tu familia en el acto y se le va a cerrar la sesión. Podés invitarla de nuevo cuando quieras.") },
            confirmButton = {
                TextButton(onClick = {
                    toRemove = null
                    scope.launch {
                        val r = callWithRetry(attempts = 2) { ApiClient.create(prefs).removeAdult(adult.id) }
                        message = if (r is ApiResult.Ok) null else (r as ApiResult.Failure).userMessage()
                        load()
                    }
                }) { Text("Quitar") }
            },
            dismissButton = { TextButton(onClick = { toRemove = null }) { Text("Cancelar") } },
        )
    }

    if (confirmLogout) {
        AlertDialog(
            onDismissRequest = { if (!busy) confirmLogout = false },
            title = { Text("¿Cerrar sesión?") },
            text = { Text("Este celular deja de recibir avisos de la familia hasta que vuelvas a ingresar. No se borra nada: tus hijos y sus datos siguen en la cuenta.") },
            confirmButton = {
                TextButton(enabled = !busy, onClick = {
                    busy = true
                    scope.launch {
                        // Primero se avisa al servidor (necesita la sesión), después se borra todo lo local.
                        PushRegistration.unregister(prefs)
                        SocketManager.disconnect()
                        prefs.clear()
                    }
                }) { Text(if (busy) "Cerrando…" else "Cerrar sesión") }
            },
            dismissButton = { TextButton(enabled = !busy, onClick = { confirmLogout = false }) { Text("Cancelar") } },
        )
    }
}
