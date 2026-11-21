package com.familyguard.parent.ui

import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.familyguard.parent.data.LatestRepository
import com.familyguard.parent.data.Prefs
import com.familyguard.parent.network.ApiClient
import com.familyguard.parent.network.ChildLatest
import com.familyguard.parent.network.CreatePairingRequest
import com.familyguard.parent.ui.theme.MemberColors
import com.familyguard.parent.util.TimeAgo
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Pantalla "Familia": resumen arriba, una tarjeta por hijo/a con su estado de
 * un vistazo, y el botón para sumar a alguien nuevo.
 *
 * Importante: distingue cargando / error / sin hijos. Antes un pedido fallido
 * se mostraba igual que "no agregaste ningún hijo", y parecía que se habían borrado.
 */
@Composable
fun HomeScreen(prefs: Prefs, onOpenChild: (ChildLatest) -> Unit) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val latest by LatestRepository.state.collectAsState()
    val parentName by prefs.nameFlow.collectAsState(initial = null)
    var showPairingDialog by remember { mutableStateOf(false) }
    var confirmDeleteChild by remember { mutableStateOf<ChildLatest?>(null) }

    // Cada 30 s se recalcula el "hace X min" sin pedir nada al servidor.
    var now by remember { mutableStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(30_000)
            now = System.currentTimeMillis()
        }
    }
    LaunchedEffect(Unit) { LatestRepository.refresh(prefs) }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { showPairingDialog = true },
                icon = { Icon(Icons.Filled.PersonAdd, null) },
                text = { Text("Agregar") },
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary,
            )
        }
    ) { padding ->
        val children = latest.children
        Column(Modifier.fillMaxSize().padding(padding)) {
            if (children.isNotEmpty()) ConnectionBanner(latest) { LatestRepository.refresh(prefs) }

            when {
                children.isEmpty() && latest.phase == LatestRepository.Phase.Error ->
                    CenterMessage(
                        title = "No pudimos cargar a tu familia",
                        body = "${latest.error.orEmpty()} Tus hijos/as siguen guardados en el servidor.",
                        action = "Reintentar",
                        onAction = { LatestRepository.refresh(prefs) },
                    )
                children.isEmpty() && latest.phase != LatestRepository.Phase.Ready -> LoadingPane()
                children.isEmpty() -> CenterMessage(
                    title = "Todavía no agregaste a nadie",
                    body = "Tocá “Agregar” para generar un código de emparejamiento.",
                )
                else -> LazyColumn(
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 96.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    item { FamilySummaryCard(parentName, children, now) }
                    itemsIndexed(children, key = { _, c -> c.childDeviceId }) { index, child ->
                        MemberCard(
                            child = child,
                            color = MemberColors[index % MemberColors.size],
                            now = now,
                            onOpen = { onOpenChild(child) },
                            onDelete = { confirmDeleteChild = child },
                        )
                    }
                }
            }
        }
    }

    if (showPairingDialog) {
        PairingDialog(
            prefs = prefs,
            onDismiss = { showPairingDialog = false },
        )
    }

    confirmDeleteChild?.let { child ->
        AlertDialog(
            onDismissRequest = { confirmDeleteChild = null },
            title = { Text("¿Eliminar a ${child.childName}?") },
            text = { Text("Se borra el perfil y todo su historial (ubicaciones, alertas, zonas). El teléfono va a tener que emparejarse de nuevo con un código.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmDeleteChild = null
                    scope.launch {
                        val api = ApiClient.create(prefs)
                        val ok = runCatching { api.deleteChild(child.childDeviceId) }.getOrNull()
                            ?.let { it.isSuccessful || it.code() == 204 } == true
                        if (ok) LatestRepository.removeChild(child.childDeviceId)
                        else Toast.makeText(context, "No se pudo eliminar. No se borró nada; probá de nuevo.", Toast.LENGTH_LONG).show()
                    }
                }) { Text("Eliminar") }
            },
            dismissButton = { TextButton(onClick = { confirmDeleteChild = null }) { Text("Cancelar") } },
        )
    }
}

@Composable
private fun MemberCard(child: ChildLatest, color: androidx.compose.ui.graphics.Color, now: Long, onOpen: () -> Unit, onDelete: () -> Unit) {
    val freshness = TimeAgo.freshness(child.lastSeenAt, now)
    val loc = child.location
    Card(
        onClick = onOpen,
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            FamilyAvatar(child.childName, color)
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(child.childName, style = MaterialTheme.typography.titleLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Spacer(Modifier.height(4.dp))
                StatusPill(freshness, presenceText(freshness, child.lastSeenAt, now))
                Spacer(Modifier.height(6.dp))
                Text(
                    if (loc != null) {
                        "📍 Ubicación ${TimeAgo.text(loc.recordedAt, now)}" + (activityLabel(loc.activityType)?.let { " · $it" } ?: "")
                    } else "Sin ubicación todavía",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                healthIssues(child, now).forEach { issue ->
                    Spacer(Modifier.height(4.dp))
                    Text("⚠ $issue", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.tertiary)
                }
            }
            Column(horizontalAlignment = Alignment.End) {
                child.batteryLevel?.let { BatteryChip(it) }
                IconButton(onClick = onDelete) {
                    Icon(Icons.Filled.Delete, contentDescription = "Eliminar a ${child.childName}", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun PairingDialog(prefs: Prefs, onDismiss: () -> Unit) {
    var childName by remember { mutableStateOf("") }
    var generatedCode by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Agregar a un hijo/a") },
        text = {
            Column {
                if (generatedCode == null) {
                    OutlinedTextField(
                        value = childName,
                        onValueChange = { childName = it },
                        label = { Text("Nombre del hijo/a") },
                    )
                    if (failed) {
                        Spacer(Modifier.height(8.dp))
                        Text(
                            "No pudimos generar el código. Si el servidor estaba dormido, probá de nuevo en un minuto.",
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                } else {
                    Text("Código: $generatedCode", style = MaterialTheme.typography.headlineMedium)
                    Spacer(Modifier.height(8.dp))
                    Text("Abrí la app FamilyGuard en el teléfono de tu hijo/a y escribí este código. Vale por 15 minutos.")
                }
            }
        },
        confirmButton = {
            if (generatedCode == null) {
                TextButton(
                    enabled = childName.isNotBlank() && !loading,
                    onClick = {
                        loading = true
                        failed = false
                        scope.launch {
                            val api = ApiClient.create(prefs)
                            val code = runCatching { api.createPairingCode(CreatePairingRequest(childName)) }
                                .getOrNull()?.body()?.code
                            if (code != null) generatedCode = code else failed = true
                            loading = false
                        }
                    }
                ) { Text(if (loading) "Generando…" else "Generar código") }
            } else {
                TextButton(onClick = onDismiss) { Text("Listo") }
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } }
    )
}
