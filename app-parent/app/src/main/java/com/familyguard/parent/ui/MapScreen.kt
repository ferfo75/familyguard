package com.familyguard.parent.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Layers
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalContext
import com.familyguard.parent.data.Prefs
import com.familyguard.parent.network.ApiClient
import com.familyguard.parent.network.SocketManager
import com.familyguard.parent.util.NavigationIntents
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.BitmapDescriptorFactory
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.LatLngBounds
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.MapProperties
import com.google.maps.android.compose.MapType
import com.google.maps.android.compose.MarkerComposable
import com.google.maps.android.compose.rememberCameraPositionState
import kotlinx.coroutines.launch

/** Estado en memoria de un hijo/a para dibujarlo en el mapa. */
private data class ChildMapState(
    val childDeviceId: String,
    val name: String,
    val position: LatLng,
    val batteryLevel: Int?,
    val lastSeenAt: String?,
)

// Una paleta fija y corta: alcanza para distinguir varios hijos sin repetir
// colores demasiado seguido, y es más clara que generar colores al azar.
private val markerColors = listOf(
    Color(0xFF2E7D32), Color(0xFF1565C0), Color(0xFFEF6C00),
    Color(0xFF6A1B9A), Color(0xFFC62828), Color(0xFF00838F),
)

/**
 * Mapa en vivo con TODOS los hijos a la vez, cada uno con su nombre visible
 * permanentemente (no solo al tocar el marcador, para verlos de un vistazo).
 * Se actualiza por socket.io sin volver a pedir nada al servidor.
 */
@Composable
fun MapScreen(prefs: Prefs) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var children by remember { mutableStateOf<Map<String, ChildMapState>>(emptyMap()) }
    var satelliteOn by remember { mutableStateOf(false) }
    var selectedForDirections by remember { mutableStateOf<ChildMapState?>(null) }
    var didInitialFit by remember { mutableStateOf(false) }

    val cameraPositionState = rememberCameraPositionState {
        position = CameraPosition.fromLatLngZoom(LatLng(0.0, 0.0), 2f)
    }

    LaunchedEffect(Unit) {
        val api = ApiClient.create(prefs)
        runCatching { api.getLatestLocations() }.getOrNull()?.body()?.let { response ->
            children = response.children
                .filter { it.location != null }
                .associate { c ->
                    c.childDeviceId to ChildMapState(
                        c.childDeviceId, c.childName, LatLng(c.location!!.lat, c.location.lng),
                        c.batteryLevel, c.lastSeenAt,
                    )
                }
        }

        SocketManager.onLocationUpdate { json ->
            val id = json.optString("childDeviceId")
            val lat = json.optDouble("lat")
            val lng = json.optDouble("lng")
            val battery = if (json.has("batteryLevel") && !json.isNull("batteryLevel")) json.optInt("batteryLevel") else null
            val existingName = children[id]?.name ?: id
            children = children + (id to ChildMapState(id, existingName, LatLng(lat, lng), battery, null))
        }
    }

    // Encuadra a todos los hijos la primera vez que tenemos sus posiciones;
    // después dejamos que el usuario mueva la cámara libremente.
    LaunchedEffect(children.keys) {
        if (didInitialFit || children.isEmpty()) return@LaunchedEffect
        didInitialFit = true
        if (children.size == 1) {
            cameraPositionState.move(CameraUpdateFactory.newLatLngZoom(children.values.first().position, 16f))
        } else {
            val builder = LatLngBounds.Builder()
            children.values.forEach { builder.include(it.position) }
            runCatching {
                cameraPositionState.move(CameraUpdateFactory.newLatLngBounds(builder.build(), 120))
            }
        }
    }

    Box(Modifier.fillMaxSize()) {
        GoogleMap(
            modifier = Modifier.fillMaxSize(),
            cameraPositionState = cameraPositionState,
            properties = MapProperties(mapType = if (satelliteOn) MapType.HYBRID else MapType.NORMAL),
        ) {
            children.values.forEachIndexed { index, child ->
                val color = markerColors[index % markerColors.size]
                MarkerComposable(
                    state = com.google.maps.android.compose.rememberMarkerState(
                        key = child.childDeviceId,
                        position = child.position,
                    ),
                    onClick = { selectedForDirections = child; true },
                ) {
                    ChildMarkerBubble(name = child.name, color = color)
                }
            }
        }

        // Botón flotante: alterna entre mapa normal y satelital.
        FilledTonalIconButton(
            onClick = { satelliteOn = !satelliteOn },
            modifier = Modifier.align(Alignment.TopEnd).padding(16.dp),
        ) { Icon(Icons.Filled.Layers, contentDescription = "Cambiar tipo de mapa") }

        if (children.isEmpty()) {
            Text(
                "Todavía no hay ubicaciones para mostrar.",
                modifier = Modifier.align(Alignment.Center).padding(24.dp),
            )
        }
    }

    selectedForDirections?.let { child ->
        DirectionsSheet(
            childName = child.name,
            lastSeenAt = child.lastSeenAt,
            batteryLevel = child.batteryLevel,
            onDismiss = { selectedForDirections = null },
            onGoogleMaps = { NavigationIntents.openGoogleMapsDirections(context, child.position.latitude, child.position.longitude) },
            onWaze = { NavigationIntents.openWazeDirections(context, child.position.latitude, child.position.longitude) },
            onOtherApp = { NavigationIntents.openChooser(context, child.position.latitude, child.position.longitude, child.name) },
        )
    }
}

/** Burbuja con el nombre del hijo/a, siempre visible arriba de su punto en el mapa. */
@Composable
private fun ChildMarkerBubble(name: String, color: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            name,
            color = Color.White,
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier
                .background(color, RoundedCornerShape(8.dp))
                .padding(horizontal = 8.dp, vertical = 2.dp)
        )
        Box(
            Modifier
                .padding(top = 2.dp)
                .size(18.dp)
                .clip(RoundedCornerShape(50))
                .background(color)
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DirectionsSheet(
    childName: String,
    lastSeenAt: String?,
    batteryLevel: Int?,
    onDismiss: () -> Unit,
    onGoogleMaps: () -> Unit,
    onWaze: () -> Unit,
    onOtherApp: () -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.padding(20.dp)) {
            Text(childName, style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(4.dp))
            val details = buildString {
                lastSeenAt?.let { append("Última actualización: $it") }
                batteryLevel?.let { if (isNotEmpty()) append(" · "); append("🔋$it%") }
            }
            if (details.isNotEmpty()) Text(details, style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(16.dp))
            Text("Ir hasta ahí con:", style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.height(8.dp))
            Button(onClick = { onGoogleMaps(); onDismiss() }, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Filled.Navigation, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text("Google Maps")
            }
            Spacer(Modifier.height(8.dp))
            OutlinedButton(onClick = { onWaze(); onDismiss() }, modifier = Modifier.fillMaxWidth()) {
                Text("Waze")
            }
            Spacer(Modifier.height(8.dp))
            TextButton(onClick = { onOtherApp(); onDismiss() }, modifier = Modifier.fillMaxWidth()) {
                Text("Otra app")
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}
