package com.familyguard.parent.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Layers
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Replay
import androidx.compose.material.icons.filled.Route
import androidx.compose.material.icons.filled.VolumeOff
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalContext
import com.familyguard.parent.data.Prefs
import com.familyguard.parent.network.ApiClient
import com.familyguard.parent.network.HistoryPoint
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
import com.google.maps.android.compose.Polyline
import com.google.maps.android.compose.rememberCameraPositionState
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Estado en memoria de un hijo/a para dibujarlo en el mapa. */
private data class ChildMapState(
    val childDeviceId: String,
    val name: String,
    val position: LatLng,
    val speedMs: Float?,
    val batteryLevel: Int?,
    val lastSeenAt: String?,
)

private fun Float?.toKmh(): String? = this?.let { "%.0f km/h".format(it * 3.6f) }

// Una paleta fija y corta: alcanza para distinguir varios hijos sin repetir
// colores demasiado seguido, y es más clara que generar colores al azar.
private val markerColors = listOf(
    Color(0xFF2E7D32), Color(0xFF1565C0), Color(0xFFEF6C00),
    Color(0xFF6A1B9A), Color(0xFFC62828), Color(0xFF00838F),
)

// Si el recorrido del día tiene muchísimos puntos (por GPS ruidoso o un día
// muy largo), lo recortamos a esta cantidad para que la animación no tarde
// una eternidad ni se sature el mapa.
private const val MAX_PLAYBACK_POINTS = 400
private const val PLAYBACK_STEP_MS = 120L

/** Reduce una lista de puntos tomando uno cada N, sin perder el primero ni el último. */
private fun <T> List<T>.downsample(maxSize: Int): List<T> {
    if (size <= maxSize) return this
    val step = (size.toFloat() / maxSize).let { if (it < 1f) 1f else it }
    val result = (0 until maxSize).map { i -> this[(i * step).toInt().coerceAtMost(size - 1)] }
    return if (result.last() == last()) result else result + last()
}

private fun formatHora(recordedAt: String): String = runCatching {
    val parsed = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale.US)
        .apply { timeZone = java.util.TimeZone.getTimeZone("UTC") }
        .parse(recordedAt.substringBefore("."))
    java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault()).format(parsed!!)
}.getOrDefault("--:--")

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
    // Satélite por defecto: se ve mucho mejor para ubicar a alguien en el
    // momento que el mapa de calles genérico.
    var satelliteOn by remember { mutableStateOf(true) }
    var selectedForDirections by remember { mutableStateOf<ChildMapState?>(null) }
    var didInitialFit by remember { mutableStateOf(false) }
    // Reproducción animada del recorrido del día de UN hijo a la vez: en vez
    // de mostrar todas las líneas superpuestas (quedaba un enredo ilegible),
    // se ve el punto moviéndose paso a paso, como si lo recorriera de nuevo.
    var playbackChildId by remember { mutableStateOf<String?>(null) }
    var playbackHistory by remember { mutableStateOf<List<HistoryPoint>>(emptyList()) }
    var playbackIndex by remember { mutableStateOf(0) }
    var isPlaying by remember { mutableStateOf(true) }
    var replayTick by remember { mutableStateOf(0) }
    var ringStatus by remember { mutableStateOf<String?>(null) }
    // Para no hacer sonar el teléfono por un toque accidental: "Hacer sonar"
    // guarda acá a quién se le tocaría hacer sonar, y recién se manda el
    // comando si confirman en el diálogo.
    var confirmRingFor by remember { mutableStateOf<ChildMapState?>(null) }

    val cameraPositionState = rememberCameraPositionState {
        position = CameraPosition.fromLatLngZoom(LatLng(0.0, 0.0), 2f)
    }

    LaunchedEffect(Unit) {
        val api = ApiClient.create(prefs)
        val latest = runCatching { api.getLatestLocations() }.getOrNull()?.body()
        latest?.let { response ->
            children = response.children
                .filter { it.location != null }
                .associate { c ->
                    c.childDeviceId to ChildMapState(
                        c.childDeviceId, c.childName, LatLng(c.location!!.lat, c.location.lng),
                        c.location.speedMs, c.batteryLevel, c.lastSeenAt,
                    )
                }
        }

        SocketManager.onLocationUpdate { json ->
            val id = json.optString("childDeviceId")
            val lat = json.optDouble("lat")
            val lng = json.optDouble("lng")
            val speed = if (json.has("speedMs") && !json.isNull("speedMs")) json.optDouble("speedMs").toFloat() else null
            val battery = if (json.has("batteryLevel") && !json.isNull("batteryLevel")) json.optInt("batteryLevel") else null
            val existing = children[id]
            children = children + (id to ChildMapState(id, existing?.name ?: id, LatLng(lat, lng), speed, battery, existing?.lastSeenAt))
        }
    }

    // Trae el recorrido del día cuando el padre elige "Ver recorrido de hoy"
    // y lo va reproduciendo paso a paso, como si volviera a caminarlo.
    LaunchedEffect(playbackChildId, replayTick) {
        val id = playbackChildId
        if (id == null) { playbackHistory = emptyList(); return@LaunchedEffect }
        playbackIndex = 0
        val api = ApiClient.create(prefs)
        val points = runCatching { api.getHistory(id) }.getOrNull()?.body()?.points ?: emptyList()
        playbackHistory = points.downsample(MAX_PLAYBACK_POINTS)
        if (playbackHistory.size < 2) { isPlaying = false; return@LaunchedEffect }
        isPlaying = true
        while (playbackIndex < playbackHistory.size - 1) {
            if (isPlaying) {
                delay(PLAYBACK_STEP_MS)
                playbackIndex++
            } else {
                delay(100)
            }
        }
        isPlaying = false
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
            // Mapa limpio por defecto: solo los marcadores con la posición
            // actual de cada hijo, sin líneas permanentes que se enreden.
            children.values.forEachIndexed { index, child ->
                if (child.childDeviceId == playbackChildId) return@forEachIndexed
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

            // Reproducción del recorrido del día: el camino se va dibujando
            // de a poco y el marcador se mueve con él, en vez de mostrar
            // todas las líneas juntas de una.
            val playbackChild = children[playbackChildId]
            if (playbackChild != null && playbackHistory.isNotEmpty()) {
                val colorIndex = children.values.toList().indexOf(playbackChild)
                val color = markerColors[colorIndex.coerceAtLeast(0) % markerColors.size]
                val shownPoints = playbackHistory.take(playbackIndex + 1).map { LatLng(it.lat, it.lng) }
                if (shownPoints.size > 1) {
                    Polyline(points = shownPoints, color = color, width = 9f)
                }
                val current = playbackHistory[playbackIndex]
                MarkerComposable(
                    state = com.google.maps.android.compose.rememberMarkerState(
                        key = "${playbackChild.childDeviceId}-playback",
                        position = LatLng(current.lat, current.lng),
                    ),
                ) {
                    ChildMarkerBubble(name = playbackChild.name, color = color)
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

        val playbackChild = children[playbackChildId]
        if (playbackChild != null) {
            PlaybackBar(
                childName = playbackChild.name,
                currentIndex = playbackIndex,
                total = playbackHistory.size,
                currentTime = playbackHistory.getOrNull(playbackIndex)?.recordedAt?.let { formatHora(it) },
                isPlaying = isPlaying,
                isFinished = playbackHistory.isNotEmpty() && playbackIndex >= playbackHistory.size - 1,
                onTogglePlay = {
                    if (playbackHistory.isNotEmpty() && playbackIndex >= playbackHistory.size - 1) {
                        replayTick++
                    } else {
                        isPlaying = !isPlaying
                    }
                },
                onScrub = { index -> playbackIndex = index; isPlaying = false },
                onClose = { playbackChildId = null },
                modifier = Modifier.align(Alignment.BottomCenter),
            )
        }
    }

    selectedForDirections?.let { child ->
        DirectionsSheet(
            childName = child.name,
            lastSeenAt = child.lastSeenAt,
            batteryLevel = child.batteryLevel,
            speedLabel = child.speedMs.toKmh(),
            onPlayRoute = {
                playbackChildId = child.childDeviceId
                replayTick++
            },
            onRing = { confirmRingFor = child; selectedForDirections = null },
            onStopRing = {
                scope.launch {
                    val api = ApiClient.create(prefs)
                    runCatching { api.stopRingDevice(child.childDeviceId) }
                    ringStatus = "Avisado: que deje de sonar en el teléfono de ${child.name}."
                }
            },
            onDismiss = { selectedForDirections = null },
            onGoogleMaps = { NavigationIntents.openGoogleMapsDirections(context, child.position.latitude, child.position.longitude) },
            onWaze = { NavigationIntents.openWazeDirections(context, child.position.latitude, child.position.longitude) },
            onOtherApp = { NavigationIntents.openChooser(context, child.position.latitude, child.position.longitude, child.name) },
        )
    }

    confirmRingFor?.let { child ->
        AlertDialog(
            onDismissRequest = { confirmRingFor = null },
            title = { Text("¿Hacer sonar el teléfono?") },
            text = { Text("Va a sonar fuerte en el teléfono de ${child.name}, aunque lo tenga en silencio.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmRingFor = null
                    scope.launch {
                        val api = ApiClient.create(prefs)
                        val ok = runCatching { api.ringDevice(child.childDeviceId) }.getOrNull()?.isSuccessful == true
                        ringStatus = if (ok) "Sonando en el teléfono de ${child.name}…" else "No se pudo: el teléfono está sin conexión ahora mismo."
                    }
                }) { Text("Hacer sonar") }
            },
            dismissButton = { TextButton(onClick = { confirmRingFor = null }) { Text("Cancelar") } },
        )
    }

    ringStatus?.let { message ->
        LaunchedEffect(message) {
            kotlinx.coroutines.delay(3000)
            ringStatus = null
        }
        Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.BottomCenter) {
            Card { Text(message, Modifier.padding(16.dp)) }
        }
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
                .shadow(3.dp, RoundedCornerShape(10.dp))
                .background(color, RoundedCornerShape(10.dp))
                .padding(horizontal = 10.dp, vertical = 4.dp)
        )
        Spacer(Modifier.height(4.dp))
        // Avatar circular con la inicial, en vez de un punto genérico —
        // diseño propio, sin usar personajes de ninguna otra app.
        Box(
            Modifier
                .shadow(4.dp, CircleShape)
                .size(34.dp)
                .clip(CircleShape)
                .background(Color.White)
                .padding(2.dp)
                .clip(CircleShape)
                .background(color),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                name.take(1).uppercase(),
                color = Color.White,
                style = MaterialTheme.typography.titleMedium,
            )
        }
        // Puntero chico abajo del avatar, para marcar el punto exacto en el mapa.
        androidx.compose.foundation.Canvas(Modifier.size(width = 10.dp, height = 6.dp)) {
            val path = Path().apply {
                moveTo(0f, 0f)
                lineTo(size.width, 0f)
                lineTo(size.width / 2f, size.height)
                close()
            }
            drawPath(path, color = color, style = Fill)
        }
    }
}

/** Controles de la reproducción animada del recorrido del día: play/pausa, línea de tiempo y hora. */
@Composable
private fun PlaybackBar(
    childName: String,
    currentIndex: Int,
    total: Int,
    currentTime: String?,
    isPlaying: Boolean,
    isFinished: Boolean,
    onTogglePlay: () -> Unit,
    onScrub: (Int) -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(modifier = modifier.fillMaxWidth().padding(12.dp)) {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Route, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp))
                Text(
                    "Recorrido de hoy · $childName" + (currentTime?.let { " · $it" } ?: ""),
                    style = MaterialTheme.typography.labelLarge,
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = onClose) {
                    Icon(Icons.Filled.Close, contentDescription = "Cerrar")
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onTogglePlay) {
                    Icon(
                        if (isFinished) Icons.Filled.Replay
                        else if (isPlaying) Icons.Filled.Pause
                        else Icons.Filled.PlayArrow,
                        contentDescription = if (isPlaying) "Pausar" else "Reproducir",
                    )
                }
                Slider(
                    value = currentIndex.toFloat(),
                    onValueChange = { onScrub(it.toInt()) },
                    valueRange = 0f..(total - 1).coerceAtLeast(1).toFloat(),
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DirectionsSheet(
    childName: String,
    lastSeenAt: String?,
    batteryLevel: Int?,
    speedLabel: String?,
    onPlayRoute: () -> Unit,
    onRing: () -> Unit,
    onStopRing: () -> Unit,
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
                speedLabel?.let { if (isNotEmpty()) append(" · "); append("🚗$it") }
            }
            if (details.isNotEmpty()) Text(details, style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(16.dp))

            OutlinedButton(onClick = { onPlayRoute(); onDismiss() }, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Filled.Route, contentDescription = null)
                Spacer(Modifier.width(6.dp))
                Text("Ver recorrido de hoy")
            }
            Spacer(Modifier.height(8.dp))
            Row(Modifier.fillMaxWidth()) {
                OutlinedButton(onClick = onRing, modifier = Modifier.weight(1f)) {
                    Icon(Icons.Filled.VolumeUp, contentDescription = null)
                    Spacer(Modifier.width(6.dp))
                    Text("Hacer sonar")
                }
                Spacer(Modifier.width(8.dp))
                OutlinedButton(onClick = { onStopRing(); onDismiss() }, modifier = Modifier.weight(1f)) {
                    Icon(Icons.Filled.VolumeOff, contentDescription = null)
                    Spacer(Modifier.width(6.dp))
                    Text("Detener")
                }
            }

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
