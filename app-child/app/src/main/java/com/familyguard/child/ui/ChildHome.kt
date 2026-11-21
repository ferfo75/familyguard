package com.familyguard.child.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.familyguard.child.data.Prefs
import com.familyguard.child.health.HealthSnapshot
import com.familyguard.child.network.ApiClient
import com.familyguard.child.network.CheckinRequest
import com.familyguard.child.network.DoneTaskRequest
import com.familyguard.child.network.HealthDto
import com.familyguard.child.network.TaskDto
import kotlinx.coroutines.launch

/**
 * Pantalla principal del hijo/a: estado de su teléfono, botón de ayuda, aviso de "llegué
 * bien / voy en camino" y las misiones que le dejó su familia.
 */
@Composable
fun ChildHome(
    prefs: Prefs,
    childName: String,
    resumeTick: Int,
    tasksTick: Int,
    uploadingTaskId: String?,
    banner: String?,
    onSos: () -> Unit,
    onTakePhoto: (String) -> Unit,
    onPickPhoto: (String) -> Unit,
    onFixSettings: () -> Unit,
) {
    var tab by remember { mutableIntStateOf(0) }
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = {
            NavigationBar {
                NavigationBarItem(selected = tab == 0, onClick = { tab = 0 }, icon = { Text("🏠") }, label = { Text("Inicio") })
                NavigationBarItem(selected = tab == 1, onClick = { tab = 1 }, icon = { Text("⭐") }, label = { Text("Misiones") })
                NavigationBarItem(selected = tab == 2, onClick = { tab = 2 }, icon = { Text("🎲") }, label = { Text("Juegos") })
            }
        },
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            when (tab) {
                0 -> HomeTab(prefs, childName, resumeTick, onSos, onFixSettings)
                1 -> MissionsTab(prefs, tasksTick, uploadingTaskId, banner, onTakePhoto, onPickPhoto)
                else -> GamesTab(prefs)
            }
        }
    }
}

// ---------------------------------------------------------------- Inicio

@Composable
private fun HomeTab(prefs: Prefs, childName: String, resumeTick: Int, onSos: () -> Unit, onFixSettings: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val health = remember(resumeTick) { HealthSnapshot.collect(context) }
    val allGood = health.batteryUnrestricted && health.backgroundLocation && health.locationEnabled

    var etaChoice by remember { mutableIntStateOf(0) } // 0 = ninguna elegida
    var note by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var result by remember { mutableStateOf<Pair<Boolean, String>?>(null) }

    fun send(kind: String, eta: Int?) {
        scope.launch {
            sending = true
            result = null
            val response = runCatching {
                ApiClient.create(prefs).sendCheckin(CheckinRequest(kind, eta, note.trim().ifEmpty { null }))
            }.getOrNull()
            sending = false
            if (response != null && response.isSuccessful) {
                result = true to "¡Listo! Avisamos a tu familia."
                note = ""
                etaChoice = 0
            } else {
                result = false to if (response == null) "No hay conexión. Probá de nuevo en un momento."
                else "No se pudo avisar (código ${response.code()}). Probá de nuevo."
            }
        }
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Surface(
            color = if (allGood) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.tertiaryContainer,
            shape = MaterialTheme.shapes.large,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(Modifier.padding(20.dp)) {
                Text("Hola, $childName", style = MaterialTheme.typography.headlineMedium)
                Spacer(Modifier.height(4.dp))
                Text(
                    if (allGood) "Tu familia puede ver dónde estás mientras FamilyGuard está activo."
                    else "Hay algo para arreglar: si no, tu familia puede dejar de verte.",
                    style = MaterialTheme.typography.bodyLarge,
                )
            }
        }

        HealthCard(health, allGood, onFixSettings)

        Button(
            onClick = onSos,
            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error, contentColor = MaterialTheme.colorScheme.onError),
            modifier = Modifier.fillMaxWidth().height(64.dp),
        ) { Text("🆘  Necesito ayuda", fontSize = 18.sp) }

        Card(
            shape = MaterialTheme.shapes.medium,
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        ) {
            Column(Modifier.padding(16.dp)) {
                Text("Avisale a tu familia", style = MaterialTheme.typography.titleLarge)
                Spacer(Modifier.height(10.dp))
                Button(enabled = !sending, onClick = { send("arrived", null) }, modifier = Modifier.fillMaxWidth()) {
                    Text("🏠  Llegué bien")
                }
                Spacer(Modifier.height(14.dp))
                Text("Voy en camino, llego en…", style = MaterialTheme.typography.labelLarge)
                Spacer(Modifier.height(6.dp))
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(5, 10, 15, 30, 45, 60).forEach { min ->
                        FilterChip(selected = etaChoice == min, onClick = { etaChoice = if (etaChoice == min) 0 else min }, label = { Text("$min min") })
                    }
                }
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = note,
                    onValueChange = { if (it.length <= 120) note = it },
                    label = { Text("Nota (opcional)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                OutlinedButton(enabled = !sending && etaChoice > 0, onClick = { send("on_my_way", etaChoice) }, modifier = Modifier.fillMaxWidth()) {
                    Text("🚶  Avisar que voy en camino")
                }
                result?.let { (ok, text) ->
                    Spacer(Modifier.height(10.dp))
                    Text(text, color = if (ok) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
}

@Composable
private fun HealthCard(health: HealthDto, allGood: Boolean, onFix: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column(Modifier.padding(16.dp)) {
            Text("Estado de tu teléfono", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(8.dp))
            HealthRow(health.locationEnabled, "GPS prendido")
            HealthRow(health.backgroundLocation, "Ubicación permitida “todo el tiempo”")
            HealthRow(health.batteryUnrestricted, "Batería sin restricciones")
            if (!allGood) {
                Spacer(Modifier.height(6.dp))
                TextButton(onClick = onFix) { Text("Arreglarlo en Ajustes") }
            }
        }
    }
}

@Composable
private fun HealthRow(ok: Boolean, label: String) {
    Row(Modifier.padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(if (ok) "✅" else "⚠️")
        Spacer(Modifier.width(10.dp))
        Text(label, style = MaterialTheme.typography.bodyMedium, color = if (ok) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.error)
    }
}

// ---------------------------------------------------------------- Misiones

private enum class Load { Loading, Ready, Error }

@Composable
private fun MissionsTab(
    prefs: Prefs,
    tasksTick: Int,
    uploadingTaskId: String?,
    banner: String?,
    onTakePhoto: (String) -> Unit,
    onPickPhoto: (String) -> Unit,
) {
    val scope = rememberCoroutineScope()
    var tasks by remember { mutableStateOf<List<TaskDto>>(emptyList()) }
    var load by remember { mutableStateOf(Load.Loading) }
    var busyId by remember { mutableStateOf<String?>(null) }
    var message by remember { mutableStateOf<String?>(null) }

    fun reload() {
        scope.launch {
            load = Load.Loading
            val r = runCatching { ApiClient.create(prefs).getMyTasks() }.getOrNull()
            val body = r?.body()
            if (r != null && r.isSuccessful && body != null) { tasks = body.tasks; load = Load.Ready } else load = Load.Error
        }
    }
    LaunchedEffect(tasksTick) { reload() }

    fun markDone(task: TaskDto) {
        scope.launch {
            busyId = task.id
            message = null
            val r = runCatching { ApiClient.create(prefs).markTaskDone(task.id, DoneTaskRequest(null)) }.getOrNull()
            busyId = null
            if (r != null && r.isSuccessful) { message = "¡Listo! Tu familia la va a revisar."; reload() }
            else message = if (r == null) "No hay conexión. Probá de nuevo en un momento." else "No se pudo (código ${r.code()}). Probá de nuevo."
        }
    }

    Column(Modifier.fillMaxSize()) {
        val shown = banner ?: message
        if (shown != null) {
            Surface(color = MaterialTheme.colorScheme.secondaryContainer, modifier = Modifier.fillMaxWidth()) {
                Text(shown, modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp), style = MaterialTheme.typography.bodyMedium)
            }
        }
        when {
            tasks.isEmpty() && load == Load.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            tasks.isEmpty() && load == Load.Error -> Column(Modifier.fillMaxSize().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                Text("No pudimos cargar tus misiones", style = MaterialTheme.typography.titleLarge)
                Spacer(Modifier.height(12.dp))
                Button(onClick = { reload() }) { Text("Reintentar") }
            }
            tasks.isEmpty() -> Column(Modifier.fillMaxSize().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                Text("Todavía no tenés misiones", style = MaterialTheme.typography.titleLarge)
                Spacer(Modifier.height(6.dp))
                Text("Cuando tu familia te deje una, aparece acá.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            else -> LazyColumn(
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(tasks, key = { it.id }) { t ->
                    MissionCard(
                        task = t,
                        busy = busyId == t.id || uploadingTaskId == t.id,
                        onDone = { markDone(t) },
                        onTakePhoto = { onTakePhoto(t.id) },
                        onPickPhoto = { onPickPhoto(t.id) },
                    )
                }
            }
        }
    }
}

@Composable
private fun MissionCard(task: TaskDto, busy: Boolean, onDone: () -> Unit, onTakePhoto: () -> Unit, onPickPhoto: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(task.title, style = MaterialTheme.typography.titleLarge)
            if (task.reward.isNotBlank()) Text("🎁 ${task.reward}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.tertiary)
            when (task.status) {
                "waiting" -> {
                    Spacer(Modifier.height(8.dp))
                    Text("⏳ Esperando que tu familia lo revise", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                "confirmed" -> {
                    Spacer(Modifier.height(8.dp))
                    Text("⭐ ¡Cumplida!", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.secondary)
                }
                else -> {
                    Spacer(Modifier.height(10.dp))
                    when {
                        busy -> Row(verticalAlignment = Alignment.CenterVertically) {
                            CircularProgressIndicator(Modifier.height(22.dp).width(22.dp), strokeWidth = 2.dp)
                            Spacer(Modifier.width(10.dp))
                            Text("Enviando…", style = MaterialTheme.typography.bodyMedium)
                        }
                        task.requiresPhoto -> Column {
                            Text("📷 Esta misión pide una foto como prueba", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(Modifier.height(6.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Button(onClick = onTakePhoto) { Text("📷 Sacar foto") }
                                OutlinedButton(onClick = onPickPhoto) { Text("🖼 Galería") }
                            }
                        }
                        else -> Button(onClick = onDone) { Text("✅ Hecha") }
                    }
                }
            }
        }
    }
}
