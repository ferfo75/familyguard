package com.familyguard.parent.ui

import android.graphics.BitmapFactory
import android.util.Base64
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.familyguard.parent.data.LatestRepository
import com.familyguard.parent.data.Prefs
import com.familyguard.parent.network.ApiClient
import com.familyguard.parent.network.ApiResult
import com.familyguard.parent.network.ChildLatest
import com.familyguard.parent.network.CreateTaskRequest
import com.familyguard.parent.network.TaskDto
import com.familyguard.parent.network.callWithRetry
import com.familyguard.parent.ui.theme.MemberColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Misiones: el padre le asigna una tarea al hijo/a (con premio y, si quiere, foto de
 * prueba), el chico la hace desde su app, y acá se revisa la foto y se aprueba.
 */
@Composable
fun TasksScreen(prefs: Prefs) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val latest by LatestRepository.state.collectAsState()
    var tasks by remember { mutableStateOf<List<TaskDto>>(emptyList()) }
    var phase by remember { mutableStateOf(LoadPhase.Loading) }
    var error by remember { mutableStateOf<String?>(null) }
    var showCreate by remember { mutableStateOf(false) }
    var creating by remember { mutableStateOf(false) }
    var createError by remember { mutableStateOf<String?>(null) }
    var reviewing by remember { mutableStateOf<TaskDto?>(null) }
    var deleting by remember { mutableStateOf<TaskDto?>(null) }

    fun reload() {
        scope.launch {
            phase = LoadPhase.Loading
            val api = ApiClient.create(prefs)
            when (val r = callWithRetry { api.getTasks() }) {
                is ApiResult.Ok -> { tasks = r.value.tasks; error = null; phase = LoadPhase.Ready }
                is ApiResult.Failure -> { error = r.userMessage(); phase = LoadPhase.Error }
            }
        }
    }
    LaunchedEffect(Unit) {
        LatestRepository.refresh(prefs)
        reload()
    }

    fun childName(id: String) = latest.children.firstOrNull { it.childDeviceId == id }?.childName ?: "—"
    fun childColor(id: String): Color {
        val i = latest.children.indexOfFirst { it.childDeviceId == id }.coerceAtLeast(0)
        return MemberColors[i % MemberColors.size]
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        floatingActionButton = {
            if (latest.children.isNotEmpty()) {
                ExtendedFloatingActionButton(
                    onClick = { createError = null; showCreate = true },
                    icon = { Icon(Icons.Filled.Add, null) },
                    text = { Text("Nueva misión") },
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = MaterialTheme.colorScheme.onPrimary,
                )
            }
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            if (phase == LoadPhase.Error && tasks.isNotEmpty()) ErrorStrip(error) { reload() }
            when {
                tasks.isEmpty() && phase == LoadPhase.Loading -> LoadingPane()
                tasks.isEmpty() && phase == LoadPhase.Error ->
                    CenterMessage("No pudimos cargar las misiones", error.orEmpty(), action = "Reintentar", onAction = { reload() })
                tasks.isEmpty() -> CenterMessage(
                    "Todavía no hay misiones",
                    if (latest.children.isEmpty()) "Primero agregá a un hijo/a desde la pestaña Familia."
                    else "Creá una con “Nueva misión”: el chico la ve en su app, la hace y te manda una foto de prueba.",
                )
                else -> {
                    val waiting = tasks.filter { it.status == "waiting" }
                    val open = tasks.filter { it.status == "open" }
                    val done = tasks.filter { it.status == "confirmed" }.take(10)
                    LazyColumn(
                        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 96.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        if (waiting.isNotEmpty()) {
                            item { SectionTitle("Para revisar (${waiting.size})") }
                            items(waiting, key = { it.id }) { t ->
                                TaskCard(t, childName(t.childDeviceId), childColor(t.childDeviceId), onReview = { reviewing = t }, onDelete = null)
                            }
                        }
                        if (open.isNotEmpty()) {
                            item { SectionTitle("Pendientes (${open.size})") }
                            items(open, key = { it.id }) { t ->
                                TaskCard(t, childName(t.childDeviceId), childColor(t.childDeviceId), onReview = null, onDelete = { deleting = t })
                            }
                        }
                        if (done.isNotEmpty()) {
                            item { SectionTitle("Cumplidas") }
                            items(done, key = { it.id }) { t ->
                                TaskCard(t, childName(t.childDeviceId), childColor(t.childDeviceId), onReview = null, onDelete = null)
                            }
                        }
                    }
                }
            }
        }
    }

    if (showCreate) {
        CreateTaskDialog(
            children = latest.children,
            busy = creating,
            error = createError,
            onDismiss = { showCreate = false },
            onCreate = { req ->
                creating = true
                createError = null
                scope.launch {
                    val api = ApiClient.create(prefs)
                    val result = callWithRetry(1) { api.createTask(req) }
                    creating = false
                    if (result is ApiResult.Ok) { showCreate = false; reload() }
                    else createError = "No se pudo crear la misión. No se perdió nada; probá de nuevo."
                }
            },
        )
    }

    reviewing?.let { task ->
        ReviewDialog(
            prefs = prefs,
            task = task,
            childName = childName(task.childDeviceId),
            onClose = { reviewing = null },
            onChanged = { message ->
                reviewing = null
                Toast.makeText(context, message, Toast.LENGTH_LONG).show()
                reload()
            },
        )
    }

    deleting?.let { task ->
        AlertDialog(
            onDismissRequest = { deleting = null },
            title = { Text("¿Borrar “${task.title}”?") },
            text = { Text("Deja de aparecerle a ${childName(task.childDeviceId)}.") },
            confirmButton = {
                TextButton(onClick = {
                    deleting = null
                    scope.launch {
                        val api = ApiClient.create(prefs)
                        val ok = runCatching { api.deleteTask(task.id) }.getOrNull()?.let { it.isSuccessful || it.code() == 204 } == true
                        if (ok) tasks = tasks.filterNot { it.id == task.id }
                        else Toast.makeText(context, "No se pudo borrar. No se perdió nada.", Toast.LENGTH_LONG).show()
                    }
                }) { Text("Borrar") }
            },
            dismissButton = { TextButton(onClick = { deleting = null }) { Text("Cancelar") } },
        )
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(text, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp))
}

private fun repeatLabel(repeat: String) = when (repeat) {
    "weekly" -> "Se repite cada semana"
    "monthly" -> "Se repite cada mes"
    else -> null
}

@Composable
private fun TaskCard(task: TaskDto, childName: String, color: Color, onReview: (() -> Unit)?, onDelete: (() -> Unit)?) {
    val statusColor = when (task.status) {
        "waiting" -> MaterialTheme.colorScheme.tertiary
        "confirmed" -> MaterialTheme.colorScheme.secondary
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }
    val statusText = when (task.status) {
        "waiting" -> "Para revisar"
        "confirmed" -> "Cumplida"
        else -> "Pendiente"
    }
    Card(
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            FamilyAvatar(childName, color, size = 40.dp)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(task.title, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text("$childName · $statusText", style = MaterialTheme.typography.bodySmall, color = statusColor)
                if (task.reward.isNotBlank()) Text("🎁 ${task.reward}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                val extras = listOfNotNull(if (task.requiresPhoto) "📷 Pide foto" else null, repeatLabel(task.repeat))
                if (extras.isNotEmpty()) Text(extras.joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (onReview != null) Button(onClick = onReview) { Text("Revisar") }
            if (onDelete != null) IconButton(onClick = onDelete) {
                Icon(Icons.Filled.Delete, contentDescription = "Borrar la misión", tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun CreateTaskDialog(
    children: List<ChildLatest>,
    busy: Boolean,
    error: String?,
    onDismiss: () -> Unit,
    onCreate: (CreateTaskRequest) -> Unit,
) {
    var childId by remember { mutableStateOf(children.firstOrNull()?.childDeviceId) }
    var title by remember { mutableStateOf("") }
    var reward by remember { mutableStateOf("") }
    var needsPhoto by remember { mutableStateOf(false) }
    var repeat by remember { mutableStateOf("none") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Nueva misión") },
        text = {
            Column(Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState())) {
                if (children.size > 1) {
                    Text("Para quién", style = MaterialTheme.typography.labelLarge)
                    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        children.forEach { c ->
                            FilterChip(selected = childId == c.childDeviceId, onClick = { childId = c.childDeviceId }, label = { Text(c.childName) })
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                }
                OutlinedTextField(title, { if (it.length <= 80) title = it }, label = { Text("Misión (ej: Ordenar el cuarto)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(reward, { if (it.length <= 80) reward = it }, label = { Text("Premio (opcional)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = needsPhoto, onCheckedChange = { needsPhoto = it })
                    Text("Pedir una foto como prueba")
                }
                Text("Repetir", style = MaterialTheme.typography.labelLarge)
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("none" to "Una vez", "weekly" to "Cada semana", "monthly" to "Cada mes").forEach { (value, label) ->
                        FilterChip(selected = repeat == value, onClick = { repeat = value }, label = { Text(label) })
                    }
                }
                if (error != null) {
                    Spacer(Modifier.height(8.dp))
                    Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = title.isNotBlank() && childId != null && !busy,
                onClick = { onCreate(CreateTaskRequest(childId!!, title.trim(), reward.trim(), needsPhoto, repeat)) },
            ) { Text(if (busy) "Creando…" else "Crear") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}

@Composable
private fun ReviewDialog(prefs: Prefs, task: TaskDto, childName: String, onClose: () -> Unit, onChanged: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    var photo by remember { mutableStateOf<ImageBitmap?>(null) }
    var photoLoading by remember { mutableStateOf(task.hasPhoto) }
    var photoFailed by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(task.id) {
        if (!task.hasPhoto) return@LaunchedEffect
        val api = ApiClient.create(prefs)
        when (val r = callWithRetry { api.getTaskPhoto(task.id) }) {
            is ApiResult.Ok -> {
                val bmp = withContext(Dispatchers.Default) {
                    runCatching {
                        val bytes = Base64.decode(r.value.photoBase64, Base64.DEFAULT)
                        BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
                    }.getOrNull()
                }
                if (bmp != null) photo = bmp else photoFailed = true
            }
            is ApiResult.Failure -> photoFailed = true
        }
        photoLoading = false
    }

    AlertDialog(
        onDismissRequest = { if (!busy) onClose() },
        title = { Text("$childName terminó: ${task.title}") },
        text = {
            Column {
                when {
                    photoLoading -> Row(verticalAlignment = Alignment.CenterVertically) {
                        CircularProgressIndicator(Modifier.size(24.dp))
                        Spacer(Modifier.width(12.dp))
                        Text("Cargando la foto…")
                    }
                    photo != null -> Image(
                        bitmap = photo!!, contentDescription = "Foto de prueba de ${task.title}",
                        contentScale = ContentScale.Fit, modifier = Modifier.fillMaxWidth().heightIn(max = 320.dp),
                    )
                    photoFailed -> Text("No se pudo cargar la foto. Podés aprobar igual o pedir que la mande de nuevo.", color = MaterialTheme.colorScheme.error)
                    else -> Text("No mandó foto.")
                }
                if (task.reward.isNotBlank()) {
                    Spacer(Modifier.height(8.dp))
                    Text("🎁 Premio: ${task.reward}", style = MaterialTheme.typography.bodyMedium)
                }
                if (message != null) {
                    Spacer(Modifier.height(8.dp))
                    Text(message!!, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
            }
        },
        confirmButton = {
            Button(
                enabled = !busy,
                onClick = {
                    busy = true
                    message = null
                    scope.launch {
                        val api = ApiClient.create(prefs)
                        when (val r = callWithRetry(1) { api.confirmTask(task.id) }) {
                            is ApiResult.Ok -> onChanged(if (r.value.next != null) "Aprobada. Se creó la próxima misión." else "Aprobada.")
                            is ApiResult.Failure -> { busy = false; message = "No se pudo aprobar. No se perdió nada; probá de nuevo." }
                        }
                    }
                },
            ) { Text(if (busy) "Un momento…" else "Aprobar") }
        },
        dismissButton = {
            Row {
                TextButton(
                    enabled = !busy,
                    onClick = {
                        busy = true
                        message = null
                        scope.launch {
                            val api = ApiClient.create(prefs)
                            when (callWithRetry(1) { api.rejectTask(task.id) }) {
                                is ApiResult.Ok -> onChanged("Le pediste que la haga de nuevo.")
                                is ApiResult.Failure -> { busy = false; message = "No se pudo. Probá de nuevo." }
                            }
                        }
                    },
                ) { Text("Pedir de nuevo") }
                TextButton(enabled = !busy, onClick = onClose) { Text("Cerrar") }
            }
        },
    )
}
