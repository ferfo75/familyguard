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
import com.familyguard.parent.network.CreateGeofenceRequest
import com.familyguard.parent.network.Geofence
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.Circle
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.rememberCameraPositionState
import kotlinx.coroutines.launch

/**
 * El padre toca el mapa para elegir el centro de una zona segura, ajusta el
 * radio con un slider y le pone un nombre ("Casa", "Colegio"). El backend
 * evalúa después, en cada ping de ubicación, si el hijo entró o salió.
 */
@Composable
fun GeofenceScreen(prefs: Prefs, forChild: ChildLatest?) {
    var geofences by remember { mutableStateOf<List<Geofence>>(emptyList()) }
    var pendingCenter by remember { mutableStateOf<LatLng?>(null) }
    var radiusMeters by remember { mutableStateOf(200f) }
    var name by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    val cameraPositionState = rememberCameraPositionState {
        position = CameraPosition.fromLatLngZoom(
            LatLng(forChild?.location?.lat ?: 0.0, forChild?.location?.lng ?: 0.0), 14f
        )
    }

    LaunchedEffect(Unit) {
        val api = ApiClient.create(prefs)
        runCatching { api.getGeofences() }.getOrNull()?.body()?.let { geofences = it.geofences }
    }

    Column(Modifier.fillMaxSize()) {
        if (forChild == null) {
            Text(
                "Elegí un hijo/a desde Inicio para centrar el mapa en su ubicación. " +
                    "Si creás una zona así, sin elegir a nadie, va a aplicar a todos tus hijos/as.",
                modifier = Modifier.padding(16.dp),
                style = MaterialTheme.typography.bodySmall,
            )
        }
        Box(Modifier.weight(1f)) {
            GoogleMap(
                modifier = Modifier.fillMaxSize(),
                cameraPositionState = cameraPositionState,
                onMapClick = { pendingCenter = it },
            ) {
                geofences.forEach { fence ->
                    Circle(
                        center = LatLng(fence.lat, fence.lng),
                        radius = fence.radiusMeters,
                        strokeColor = androidx.compose.ui.graphics.Color.Blue,
                        fillColor = androidx.compose.ui.graphics.Color(0x220000FF),
                    )
                }
                pendingCenter?.let {
                    Circle(
                        center = it,
                        radius = radiusMeters.toDouble(),
                        strokeColor = androidx.compose.ui.graphics.Color.Green,
                        fillColor = androidx.compose.ui.graphics.Color(0x2200FF00),
                    )
                }
            }
        }

        if (pendingCenter != null) {
            Column(Modifier.padding(16.dp)) {
                OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Nombre (ej: Casa)") })
                Spacer(Modifier.height(8.dp))
                Text("Radio: ${radiusMeters.toInt()} m")
                Slider(value = radiusMeters, onValueChange = { radiusMeters = it }, valueRange = 50f..2000f)
                Spacer(Modifier.height(8.dp))
                Row {
                    Button(
                        enabled = name.isNotBlank(),
                        onClick = {
                            val center = pendingCenter!!
                            scope.launch {
                                val api = ApiClient.create(prefs)
                                runCatching {
                                    api.createGeofence(
                                        CreateGeofenceRequest(name, center.latitude, center.longitude, radiusMeters.toDouble(), forChild?.childDeviceId)
                                    )
                                }
                                geofences = runCatching { api.getGeofences() }.getOrNull()?.body()?.geofences ?: geofences
                                pendingCenter = null
                                name = ""
                            }
                        }
                    ) { Text("Guardar zona") }
                    Spacer(Modifier.width(8.dp))
                    OutlinedButton(onClick = { pendingCenter = null }) { Text("Cancelar") }
                }
            }
        } else {
            LazyColumn(Modifier.heightIn(max = 180.dp)) {
                items(geofences) { fence ->
                    ListItem(
                        headlineContent = { Text(fence.name) },
                        supportingContent = { Text("Radio: ${fence.radiusMeters.toInt()} m") },
                        trailingContent = {
                            TextButton(onClick = {
                                scope.launch {
                                    val api = ApiClient.create(prefs)
                                    runCatching { api.deleteGeofence(fence.id) }
                                    geofences = geofences.filterNot { it.id == fence.id }
                                }
                            }) { Text("Borrar") }
                        }
                    )
                }
            }
        }
    }
}
