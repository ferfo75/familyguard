package com.familyguard.child

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.familyguard.child.battery.BatteryOptimization
import com.familyguard.child.data.Prefs
import com.familyguard.child.network.ApiClient
import com.familyguard.child.network.RedeemPairingRequest
import com.familyguard.child.service.LocationTrackingService
import com.familyguard.child.ui.theme.FamilyGuardChildTheme
import com.familyguard.child.worker.LocationFallbackWorker
import com.familyguard.child.worker.UsageReportWorker
import kotlinx.coroutines.launch
import java.util.concurrent.TimeUnit

class MainActivity : ComponentActivity() {

    private val prefs by lazy { Prefs(applicationContext) }

    private val requestLocationPermissions = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { onLocationPermissionsResult() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            FamilyGuardChildTheme {
                val isPaired by prefs.isPaired.collectAsState(initial = false)
                val childName by prefs.childNameFlow.collectAsState(initial = null)
                // Se recalcula cada vez que la Activity vuelve a primer plano (por
                // ejemplo, al volver de Ajustes), para saber si ya se cumplieron
                // los pasos obligatorios.
                var recheckTick by remember { mutableIntStateOf(0) }
                DisposableEffect(Unit) {
                    val observer = androidx.lifecycle.LifecycleEventObserver { _, event ->
                        if (event == androidx.lifecycle.Lifecycle.Event.ON_RESUME) recheckTick++
                    }
                    lifecycle.addObserver(observer)
                    onDispose { lifecycle.removeObserver(observer) }
                }

                var updateInfo by remember { mutableStateOf<com.familyguard.child.network.AppVersionInfo?>(null) }
                var downloading by remember { mutableStateOf(false) }

                Surface(Modifier.fillMaxSize()) {
                    if (isPaired) {
                        val setupComplete = remember(recheckTick) { isMandatorySetupComplete() }
                        if (setupComplete) {
                            PairedScreen(childName ?: "")
                            LaunchedEffect(Unit) {
                                onAlreadyPaired()
                                updateInfo = com.familyguard.child.update.AppUpdater.checkForUpdate(prefs)
                            }
                            updateInfo?.let { info ->
                                AlertDialog(
                                    onDismissRequest = { updateInfo = null },
                                    title = { Text("Hay una versión nueva") },
                                    text = { Text(info.notes ?: "Versión ${info.versionName} disponible.") },
                                    confirmButton = {
                                        Button(
                                            enabled = !downloading,
                                            onClick = {
                                                downloading = true
                                                lifecycleScope.launch {
                                                    com.familyguard.child.update.AppUpdater.downloadAndInstall(this@MainActivity, info)
                                                    downloading = false
                                                }
                                            }
                                        ) { Text(if (downloading) "Descargando…" else "Actualizar") }
                                    },
                                    dismissButton = { TextButton(onClick = { updateInfo = null }) { Text("Ahora no") } },
                                )
                            }
                        } else {
                            MandatorySetupScreen(
                                onContinue = { recheckTick++ }, // fuerza un recálculo al volver
                            )
                        }
                    } else {
                        PairingScreen(onPaired = { onJustPaired() })
                    }
                }
            }
        }
    }

    // Pasos sin los cuales la app directamente no sirve: si falta alguno, no
    // dejamos pasar a la pantalla normal aunque el usuario cierre los
    // carteles del sistema. A diferencia de antes, esto no es "un toast y
    // listo" — se vuelve a chequear cada vez que la app vuelve a primer
    // plano, así que no hay forma de avanzar sin resolverlo de verdad.
    private fun isMandatorySetupComplete(): Boolean {
        return hasForegroundLocationPermission() &&
            BatteryOptimization.isIgnoringBatteryOptimizations(this) &&
            isGpsEnabled()
    }

    @Composable
    fun MandatorySetupScreen(onContinue: () -> Unit) {
        Column(Modifier.fillMaxSize().padding(24.dp)) {
            Text("Antes de empezar", style = MaterialTheme.typography.headlineMedium)
            Spacer(Modifier.height(8.dp))
            Text(
                "Estos pasos son obligatorios — sin ellos Android puede cortar la " +
                    "ubicación en cualquier momento sin avisar. No se puede usar la " +
                    "app hasta completarlos."
            )
            Spacer(Modifier.height(24.dp))

            SetupStepRow(
                done = hasForegroundLocationPermission(),
                title = "Permiso de ubicación",
                buttonLabel = "Otorgar",
                onClick = { requestLocationPermissions.launch(buildLocationPermissions()) },
            )
            Spacer(Modifier.height(16.dp))
            SetupStepRow(
                done = isGpsEnabled(),
                title = "GPS / ubicación del sistema activada",
                buttonLabel = "Activar",
                onClick = { startActivity(Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)) },
            )
            Spacer(Modifier.height(16.dp))
            SetupStepRow(
                done = BatteryOptimization.isIgnoringBatteryOptimizations(this@MainActivity),
                title = "Batería sin restricciones para FamilyGuard",
                buttonLabel = "Desactivar ahorro",
                onClick = {
                    BatteryOptimization.requestIgnoreBatteryOptimizations(this@MainActivity)
                    // Si el diálogo estándar no aparece (algunos fabricantes lo
                    // bloquean), al menos lo dejamos parado en la pantalla correcta.
                    BatteryOptimization.openSystemBatterySettings(this@MainActivity)
                },
            )

            Spacer(Modifier.height(24.dp))
            Text(
                "Si ya hiciste los tres pasos y sigue sin avanzar, volvé a esta " +
                    "pantalla — se actualiza sola al volver de Ajustes.",
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }

    @Composable
    private fun SetupStepRow(done: Boolean, title: String, buttonLabel: String, onClick: () -> Unit) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            Text(if (done) "✅" else "⬜", style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.width(12.dp))
            Text(title, modifier = Modifier.weight(1f))
            if (!done) {
                Button(onClick = onClick) { Text(buttonLabel) }
            }
        }
    }

    private fun isGpsEnabled(): Boolean {
        val locationManager = getSystemService(LOCATION_SERVICE) as LocationManager
        return runCatching { locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER) }.getOrDefault(false)
    }

    @Composable
    fun PairingScreen(onPaired: () -> Unit) {
        var code by remember { mutableStateOf("") }
        var loading by remember { mutableStateOf(false) }
        var error by remember { mutableStateOf<String?>(null) }
        val scope = rememberCoroutineScope()

        Column(
            Modifier.fillMaxSize().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text("FamilyGuard", style = MaterialTheme.typography.headlineMedium)
            Spacer(Modifier.height(8.dp))
            Text("Pedile a tu padre o madre el código de 6 dígitos que generó en su app.")
            Spacer(Modifier.height(24.dp))
            OutlinedTextField(
                value = code,
                onValueChange = { if (it.length <= 6) code = it },
                label = { Text("Código de emparejamiento") },
            )
            Spacer(Modifier.height(16.dp))
            Button(
                enabled = code.length == 6 && !loading,
                onClick = {
                    loading = true
                    error = null
                    scope.launch {
                        runCatching {
                            val api = ApiClient.create(prefs)
                            val response = api.redeemPairing(
                                RedeemPairingRequest(code, Build.MODEL)
                            )
                            if (!response.isSuccessful) throw IllegalStateException("code_rejected")
                            val body = response.body()!!
                            prefs.savePairing(body.deviceToken, body.childDeviceId, body.childName)
                        }.onSuccess {
                            loading = false
                            onPaired()
                        }.onFailure {
                            loading = false
                            error = "No pudimos validar ese código. Pedí uno nuevo."
                        }
                    }
                }
            ) { Text(if (loading) "Validando…" else "Conectar") }
            error?.let {
                Spacer(Modifier.height(12.dp))
                Text(it, color = MaterialTheme.colorScheme.error)
            }
        }
    }

    @Composable
    fun PairedScreen(childName: String) {
        Column(
            Modifier.fillMaxSize().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text("¡Listo, $childName!", style = MaterialTheme.typography.headlineMedium)
            Spacer(Modifier.height(8.dp))
            Text("FamilyGuard está activo y compartiendo tu ubicación con tu familia.")
        }
    }

    private fun onJustPaired() {
        requestLocationPermissions.launch(buildLocationPermissions())
    }

    private fun onAlreadyPaired() {
        ensureLocationPermissionsAndStart()
        scheduleUsageReportWorker()
    }

    private fun buildLocationPermissions(): Array<String> {
        val permissions = mutableListOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION,
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions += Manifest.permission.POST_NOTIFICATIONS
        }
        return permissions.toTypedArray()
    }

    private fun onLocationPermissionsResult() {
        if (hasForegroundLocationPermission()) {
            // La ubicación en background se pide por separado: Android exige mostrarla
            // en un segundo paso, no junto con fine/coarse location.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
                ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION) != PackageManager.PERMISSION_GRANTED
            ) {
                requestLocationPermissions.launch(arrayOf(Manifest.permission.ACCESS_BACKGROUND_LOCATION))
            } else {
                startTrackingAndExtras()
            }
        }
    }

    private fun ensureLocationPermissionsAndStart() {
        if (hasForegroundLocationPermission()) startTrackingAndExtras()
        else requestLocationPermissions.launch(buildLocationPermissions())
    }

    private fun hasForegroundLocationPermission(): Boolean =
        ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

    // Para cuando llegamos acá, ubicación/GPS/batería ya están resueltos
    // (MandatorySetupScreen no deja pasar si no), así que esto solo arranca
    // el servicio y deja pendiente el único paso no-crítico (acceso a datos
    // de uso), que si se salta solo afecta la pantalla de "Uso", no el
    // seguimiento en sí.
    private fun startTrackingAndExtras() {
        LocationTrackingService.start(this)
        scheduleUsageReportWorker()
        scheduleLocationFallbackWorker()
        promptUsageAccessIfNeeded()
    }

    private fun scheduleUsageReportWorker() {
        val request = PeriodicWorkRequestBuilder<UsageReportWorker>(1, TimeUnit.DAYS).build()
        WorkManager.getInstance(this)
            .enqueueUniquePeriodicWork("usage_report", ExistingPeriodicWorkPolicy.KEEP, request)
    }

    // Red de seguridad por si el fabricante (Motorola incluido) mata el
    // foreground service de ubicación: WorkManager reintenta un ping cada
    // 15 minutos de forma independiente. Ver LocationFallbackWorker.
    private fun scheduleLocationFallbackWorker() {
        val request = PeriodicWorkRequestBuilder<LocationFallbackWorker>(15, TimeUnit.MINUTES).build()
        WorkManager.getInstance(this)
            .enqueueUniquePeriodicWork("location_fallback", ExistingPeriodicWorkPolicy.KEEP, request)
    }

    // El permiso de "Acceso a datos de uso" y la activación del servicio de
    // Accesibilidad no se pueden pedir con un diálogo del sistema: hay que
    // llevar al usuario a la pantalla de Ajustes correspondiente.
    private fun promptUsageAccessIfNeeded() {
        toast("Paso 1 de 3: activá \"Acceso a datos de uso\" para FamilyGuard")
        startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
    }

    // Si el modo de ubicación del sistema está en "Solo dispositivo" o
    // "Ahorro de batería" (no usa GPS), la precisión queda pésima o deja de
    // reportar del todo — pasa seguido en equipos de entrada. Llevamos al
    // usuario directo a Ajustes de ubicación para que active "Alta precisión".
    private fun ensureHighAccuracyLocationMode() {
        val locationManager = getSystemService(LOCATION_SERVICE) as LocationManager
        val gpsEnabled = runCatching { locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER) }.getOrDefault(false)
        if (!gpsEnabled) {
            toast("Paso 2 de 3: activá el GPS / modo \"Alta precisión\"")
            startActivity(Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS))
        }
    }

    private fun toast(message: String) {
        android.widget.Toast.makeText(this, message, android.widget.Toast.LENGTH_LONG).show()
    }
}
