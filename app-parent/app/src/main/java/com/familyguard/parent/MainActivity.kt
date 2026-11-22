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
import androidx.compose.ui.unit.sp
import androidx.lifecycle.lifecycleScope
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.familyguard.parent.data.Prefs
import com.familyguard.parent.data.LatestRepository
import com.familyguard.parent.network.ApiClient
import com.familyguard.parent.network.ApiResult
import com.familyguard.parent.network.ChildLatest
import com.familyguard.parent.network.callWithRetry
import com.familyguard.parent.network.SocketManager
import com.familyguard.parent.ui.*
import com.familyguard.parent.ui.theme.FamilyGuardParentTheme
import com.familyguard.parent.util.NavigationIntents
import kotlinx.coroutines.launch
import org.json.JSONObject

class MainActivity : ComponentActivity() {

    private val prefs by lazy { Prefs(applicationContext) }

    /** Cada vez que se vuelve a la app se actualiza la lista: no hace falta "tocar en varios lados". */
    override fun onStart() {
        super.onStart()
        lifecycleScope.launch {
            if (prefs.tokenOrNull() != null) LatestRepository.refresh(prefs)
        }
    }
    /** Único hijo abierto en Uso/Zonas; se guarda acá porque NavController
     * no serializa bien objetos de red completos entre pantallas. */
    private var selectedChild: ChildLatest? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            FamilyGuardParentTheme {
                Surface {
                    val isLoggedIn by prefs.isLoggedIn.collectAsState(initial = false)
                    val token by prefs.tokenFlow.collectAsState(initial = null)
                    // Al cerrarse la sesión no debe quedar nada del usuario anterior en memoria.
                    LaunchedEffect(isLoggedIn) { if (!isLoggedIn) LatestRepository.reset() }
                    // Android 13+: sin este permiso no se muestra ninguna notificación.
                    val notifLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
                        androidx.activity.result.contract.ActivityResultContracts.RequestPermission()
                    ) {}
                    LaunchedEffect(isLoggedIn) {
                        if (isLoggedIn && android.os.Build.VERSION.SDK_INT >= 33 &&
                            checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED
                        ) notifLauncher.launch(android.Manifest.permission.POST_NOTIFICATIONS)
                    }
                    var updateInfo by remember { mutableStateOf<com.familyguard.parent.network.AppVersionInfo?>(null) }
                    var downloadingUpdate by remember { mutableStateOf(false) }

                    LaunchedEffect(token) {
                        if (token != null) {
                            SocketManager.connect(token!!)
                            // Alerta en vivo (app abierta): misma sirena y ventana que por push.
                            // Si llegan las dos, AlertCenter atiende una sola por id de alerta.
                            SocketManager.onSosAlert { json: JSONObject ->
                                val who = json.optString("childName", "Tu hijo/a")
                                val msg = if (json.isNull("message") || !json.has("message")) null else json.getString("message")
                                com.familyguard.parent.alerts.AlertCenter.handle(
                                    applicationContext,
                                    com.familyguard.parent.alerts.FamilyAlert(
                                        kind = "sos",
                                        title = "🆘 $who pidió ayuda",
                                        body = msg ?: "Tocó el botón de pánico.",
                                        lat = json.optDouble("lat").takeIf { !it.isNaN() },
                                        lng = json.optDouble("lng").takeIf { !it.isNaN() },
                                        alertId = json.optString("id").ifEmpty { null },
                                    ),
                                )
                            }
                            // Cada inicio de sesión registra este celular para recibir los avisos de la familia.
                            com.familyguard.parent.push.PushRegistration.register(prefs)
                            updateInfo = com.familyguard.parent.update.AppUpdater.checkForUpdate(prefs)

                            // Sesión deslizante: si pasó más de un día desde la última renovación, se pide un
                            // token nuevo. Si el servidor todavía no tiene esta ruta (404) simplemente no pasa nada.
                            if (System.currentTimeMillis() - prefs.lastTokenRefreshAt() > 24L * 60 * 60 * 1000) {
                                val api = ApiClient.create(prefs)
                                val renewed = callWithRetry(attempts = 1) { api.refreshSession() }
                                if (renewed is ApiResult.Ok) prefs.saveSession(renewed.value.token, renewed.value.parent.name)
                            }
                        }
                    }

                    if (isLoggedIn) {
                        AppNavigation(prefs) { selectedChild = it }
                    } else {
                        LoginScreen(prefs, onLoggedIn = {})
                    }

                    updateInfo?.let { info ->
                        AlertDialog(
                            onDismissRequest = { updateInfo = null },
                            title = { Text("Hay una versión nueva") },
                            text = { Text(info.notes ?: "Versión ${info.versionName} disponible.") },
                            confirmButton = {
                                Button(
                                    enabled = !downloadingUpdate,
                                    onClick = {
                                        downloadingUpdate = true
                                        lifecycleScope.launch {
                                            val ok = com.familyguard.parent.update.AppUpdater.downloadAndInstall(this@MainActivity, info)
                                            downloadingUpdate = false
                                            if (!ok) android.widget.Toast.makeText(this@MainActivity, "No se pudo descargar la actualización. Revisá la conexión y probá de nuevo.", android.widget.Toast.LENGTH_LONG).show()
                                        }
                                    }
                                ) { Text(if (downloadingUpdate) "Descargando…" else "Actualizar") }
                            },
                            dismissButton = { TextButton(onClick = { updateInfo = null }) { Text("Ahora no") } },
                        )
                    }
                }
            }
        }
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
                composable("tasks") {
                    TasksScreen(prefs)
                }
                composable("feed") {
                    FeedScreen(prefs)
                }
                composable("games") {
                    GamesScreen(prefs)
                }
                composable("more") {
                    val latest by LatestRepository.state.collectAsState()
                    MoreScreen(
                        prefs = prefs,
                        children = latest.children,
                        onGames = { navController.navigate("games") },
                        onZones = { navController.navigate("geofences") },
                        onSos = { navController.navigate("sos") },
                        onUsage = { child ->
                            onSelectChild(child)
                            selectedChild = child
                            navController.navigate("usage")
                        },
                    )
                }
            }
        }
    }

    @Composable
    private fun BottomBar(navController: NavHostController) {
        val backStack by navController.currentBackStackEntryAsState()
        val current = backStack?.destination?.route
        // Pestañas de primer nivel: no apilan pantallas (la de atrás vuelve a Familia y de ahí se sale).
        fun goTab(route: String) {
            navController.navigate(route) {
                popUpTo("home")
                launchSingleTop = true
            }
        }
        NavigationBar {
            NavigationBarItem(
                selected = current == "home",
                onClick = { goTab("home") },
                icon = { Icon(Icons.Filled.Groups, null) },
                label = { TabLabel("Familia") },
            )
            NavigationBarItem(
                selected = current == "map",
                onClick = { goTab("map") },
                icon = { Icon(Icons.Filled.Place, null) },
                label = { TabLabel("Mapa") },
            )
            NavigationBarItem(
                selected = current == "tasks",
                onClick = { goTab("tasks") },
                icon = { Icon(Icons.Filled.TaskAlt, null) },
                label = { TabLabel("Misiones") },
            )
            NavigationBarItem(
                selected = current == "feed",
                onClick = { goTab("feed") },
                icon = { Icon(Icons.Filled.Notifications, null) },
                label = { TabLabel("Novedades") },
            )
            NavigationBarItem(
                // Zonas, Uso y SOS viven dentro de "Más".
                selected = current in setOf("more", "games", "geofences", "usage", "sos"),
                onClick = { goTab("more") },
                icon = { Icon(Icons.Filled.MoreHoriz, null) },
                label = { TabLabel("Más") },
            )
        }
    }
}

/** Nombre de una pestaña: una sola línea y chico, así no se parte en celulares angostos o con letra grande ("Mision/es"). */
@Composable
private fun TabLabel(text: String) {
    Text(
        text,
        maxLines = 1,
        softWrap = false,
        overflow = androidx.compose.ui.text.style.TextOverflow.Clip,
        fontSize = 11.sp,
    )
}
