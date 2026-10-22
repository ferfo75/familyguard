package com.familyguard.parent.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.familyguard.parent.data.Prefs
import com.familyguard.parent.network.ApiClient
import com.familyguard.parent.network.ChildLatest
import com.familyguard.parent.network.CreatePairingRequest
import kotlinx.coroutines.launch

/**
 * Pantalla principal: lista de hijos emparejados con su último estado
 * conocido, y el botón para generar un código de emparejamiento nuevo.
 */
@Composable
fun HomeScreen(prefs: Prefs, onOpenChild: (ChildLatest) -> Unit) {
    val scope = rememberCoroutineScope()
    var children by remember { mutableStateOf<List<ChildLatest>>(emptyList()) }
    var showPairingDialog by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        val api = ApiClient.create(prefs)
        runCatching { api.getLatestLocations() }.getOrNull()?.body()?.let { children = it.children }
    }

    Scaffold(
        floatingActionButton = {
            FloatingActionButton(onClick = { showPairingDialog = true }) { Icon(Icons.Filled.Add, null) }
        }
    ) { padding ->
        if (children.isEmpty()) {
            Column(
                Modifier.fillMaxSize().padding(padding).padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Text("Todavía no agregaste a ningún hijo/a.")
                Spacer(Modifier.height(8.dp))
                Text("Tocá el botón + para generar un código de emparejamiento.")
            }
        } else {
            LazyColumn(Modifier.fillMaxSize().padding(padding)) {
                items(children) { child ->
                    ListItem(
                        headlineContent = { Text(child.childName) },
                        supportingContent = {
                            Text(
                                if (child.location != null) "Última ubicación: ${child.location.recordedAt}"
                                else "Sin datos de ubicación todavía"
                            )
                        },
                        trailingContent = { child.batteryLevel?.let { Text("🔋$it%") } },
                        modifier = Modifier.clickable { onOpenChild(child) }
                    )
                    HorizontalDivider()
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
}

@Composable
private fun PairingDialog(prefs: Prefs, onDismiss: () -> Unit) {
    var childName by remember { mutableStateOf("") }
    var generatedCode by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }
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
                        scope.launch {
                            val api = ApiClient.create(prefs)
                            runCatching { api.createPairingCode(CreatePairingRequest(childName)) }
                                .getOrNull()?.body()?.let { generatedCode = it.code }
                            loading = false
                        }
                    }
                ) { Text("Generar código") }
            } else {
                TextButton(onClick = onDismiss) { Text("Listo") }
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } }
    )
}
