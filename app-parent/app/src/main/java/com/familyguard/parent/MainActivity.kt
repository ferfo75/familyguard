package com.familyguard.parent

import android.content.Context
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.familyguard.parent.data.Prefs
import com.familyguard.parent.network.ChildLatest
import com.familyguard.parent.network.SocketManager
import com.familyguard.parent.ui.*
import com.familyguard.parent.util.NavigationIntents
import org.json.JSONObject

/** Datos de una alerta de pánico recibida en vivo por socket, para el diálogo global. */
private data class SosUi(val childName: String, val lat: Double, val lng: Double, val message: String?)

class MainActivity : ComponentActivity() {

    private val prefs by lazy { Prefs(applicationContext) }
    /** Único hijo abierto en Uso/Zonas; se guarda acá porque NavController
     * no serializa bien objetos de red completos entre pantallas. */
    private var selectedChild: ChildLatest? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface {
                    val isLoggedIn by prefs.isLoggedIn.collectAsState(initial = false)
                    val token by prefs.tokenFlow.collectAsState(initial = null)
                    var activeSos by remember { mutableStateOf<SosUi?>(null) }

                    LaunchedEffect(token) {
                        if (token != null) {
                            SocketManager.connect(token!!)
                            // Alerta en vivo: aparece de inmediato sin importar qué
                            // pantalla se esté mirando, con quién la mandó.
                            SocketManager.onSosAlert { json: JSONObject ->
                                activeSos = SosUi(
                                    childName = json.optString("childName", "Tu hijo/a"),
                                    lat = json.optDouble("lat"),
                                    lng = json.optDouble("lng"),
                                    message = if (json.isNull("message") || !json.has("message")) null else json.getString("message"),
                                )
                            }
                        }
                    }

                    if (isLoggedIn) {
                        AppNavigation(prefs) { selectedChild = it }
                    } else {
                        LoginScreen(prefs, onLoggedIn = {})
                    }

                    activeSos?.let { sos -> SosAlertDialog(sos, onDismiss = { activeSos = null }) }
                }
            }
        }
    }

    @Composable
    private fun SosAlertDialog(sos: SosUi, onDismiss: () -> Unit) {
        val context = LocalContext.current
        AlertDialog(
            onDismissRequest = onDismiss,
            icon = { Icon(Icons.Filled.Warning, contentDescription = null, tint = MaterialTheme.colorScheme.error) },
            title = { Text("🆘 ${sos.childName} pidió ayuda") },
            text = {
                Column {
                    Text(sos.message ?: "Tocó el botón de pánico.")
                    Spacer(Modifier.height(4.dp))
                    Text("Ubicación: ${sos.lat}, ${sos.lng}", style = MaterialTheme.typography.bodySmall)
                }
            },
            confirmButton = {
                Button(onClick = { NavigationIntents.openGoogleMapsDirections(context, sos.lat, sos.lng) }) {
                    Text("Ir hasta ahí")
                }
            },
            dismissButton = {
                TextButton(onClick = onDismiss) { Text("Cerrar") }
            },
        )
    }

    @Composable
    private fun AppNavigation(prefs: Prefs, onSelectChild: (ChildLatest) -> Unit) {
        val navController = rememberNavController()
        Scaffold(bottomBar = { BottomBar(navController) }) { padding ->
            NavHost(navController, startDestination = "home", modifier = Modifier.padding(padding)) {
                composable("home") {
                    HomeScreen(prefs) { child ->
                        onSelectChild(child)
                        selectedChild = child
                        navController.navigate("usage")
                    }
                }
                composable("map") {
                    MapScreen(prefs)
                }
                composable("geofences") {
                    GeofenceScreen(prefs, selectedChild)
                }
                composable("usage") {
                    selectedChild?.let { UsageScreen(prefs, it) } ?: Text("Elegí un hijo/a desde Inicio.")
                }
                composable("sos") {
                    SosScreen(prefs)
                }
            }
        }
    }

    @Composable
    private fun BottomBar(navController: NavHostController) {
        val backStack by navController.currentBackStackEntryAsState()
        val current = backStack?.destination?.route
        NavigationBar {
            NavigationBarItem(
                selected = current == "home",
                onClick = { navController.navigate("home") },
                icon = { Icon(Icons.Filled.Home, null) },
                label = { Text("Inicio") },
            )
            NavigationBarItem(
                selected = current == "map",
                onClick = { navController.navigate("map") },
                icon = { Icon(Icons.Filled.Place, null) },
                label = { Text("Mapa") },
            )
            NavigationBarItem(
                selected = current == "geofences",
                onClick = { navController.navigate("geofences") },
                icon = { Icon(Icons.Filled.Shield, null) },
                label = { Text("Zonas") },
            )
            NavigationBarItem(
                selected = current == "usage",
                onClick = { navController.navigate("usage") },
                icon = { Icon(Icons.Filled.Timer, null) },
                label = { Text("Uso") },
            )
            NavigationBarItem(
                selected = current == "sos",
                onClick = { navController.navigate("sos") },
                icon = { Icon(Icons.Filled.Warning, null) },
                label = { Text("SOS") },
            )
        }
    }
}
