package com.familyguard.child.sos

import android.Manifest
import android.content.pm.PackageManager
import android.media.MediaRecorder
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
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
import com.familyguard.child.data.Prefs
import com.familyguard.child.network.ApiClient
import com.familyguard.child.network.SosAudioRequest
import com.familyguard.child.network.SosRequest
import com.google.android.gms.location.LocationServices
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import java.io.File

/**
 * Se abre al tocar "Enviar SOS" en la notificación. Manda la alerta de
 * ubicación de inmediato (eso no espera a nada) y, aparte, le da al chico
 * la opción de grabar un mensaje de voz corto para mandar junto con la
 * alerta — grabarlo es una decisión suya en el momento, no algo que el
 * padre activa a distancia.
 */
class SosActivity : ComponentActivity() {

    private val prefs by lazy { Prefs(applicationContext) }
    private var recorder: MediaRecorder? = null
    private var audioFile: File? = null

    private val requestMicPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted -> if (granted) pendingRecordStart?.invoke() }
    private var pendingRecordStart: (() -> Unit)? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface(Modifier.fillMaxSize()) { SosFlow() }
            }
        }
    }

    @Composable
    private fun SosFlow() {
        var sending by remember { mutableStateOf(true) }
        var sentOk by remember { mutableStateOf(false) }
        var alertId by remember { mutableStateOf<String?>(null) }
        var isRecording by remember { mutableStateOf(false) }
        var secondsLeft by remember { mutableIntStateOf(MAX_RECORD_SECONDS) }
        var recordedDone by remember { mutableStateOf(false) }
        var uploading by remember { mutableStateOf(false) }
        var finished by remember { mutableStateOf(false) }
        val scope = rememberCoroutineScope()

        LaunchedEffect(Unit) {
            val sent = sendSosAlert()
            alertId = sent
            sentOk = sent != null
            sending = false
        }

        Column(
            Modifier.fillMaxSize().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text("🆘", style = MaterialTheme.typography.displayMedium)
            Spacer(Modifier.height(16.dp))
            when {
                finished -> {
                    Text("Listo, tu familia ya lo sabe.", style = MaterialTheme.typography.titleLarge)
                    LaunchedEffect(Unit) { Handler(Looper.getMainLooper()).postDelayed({ finish() }, 1500) }
                }
                sending -> Text("Enviando tu alerta…", style = MaterialTheme.typography.titleLarge)
                !sentOk -> {
                    Text("No se pudo enviar. Revisá tu conexión.", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(16.dp))
                    Button(onClick = { finish() }) { Text("Cerrar") }
                }
                uploading -> Text("Mandando tu mensaje…", style = MaterialTheme.typography.titleLarge)
                recordedDone -> {
                    Text("Audio grabado.", style = MaterialTheme.typography.titleLarge)
                    Spacer(Modifier.height(16.dp))
                    Button(onClick = {
                        uploading = true
                        scope.launch {
                            uploadRecording(alertId)
                            uploading = false
                            finished = true
                        }
                    }) { Text("Mandar") }
                }
                isRecording -> {
                    Text("Grabando… ($secondsLeft s)", style = MaterialTheme.typography.titleLarge)
                    Spacer(Modifier.height(16.dp))
                    Button(onClick = {
                        stopRecording()
                        isRecording = false
                        recordedDone = true
                    }) { Text("Listo") }
                }
                else -> {
                    Text("Tu familia ya recibió tu ubicación.", style = MaterialTheme.typography.titleLarge)
                    Spacer(Modifier.height(8.dp))
                    Text("¿Querés grabar un mensaje de voz corto para contarles qué pasa? (opcional)")
                    Spacer(Modifier.height(24.dp))
                    Button(onClick = {
                        startRecordingFlow {
                            isRecording = true
                            secondsLeft = MAX_RECORD_SECONDS
                            tickDown { secondsLeft = it; if (it <= 0) { stopRecording(); isRecording = false; recordedDone = true } }
                        }
                    }) { Text("Grabar mensaje de voz") }
                    Spacer(Modifier.height(12.dp))
                    TextButton(onClick = { finished = true }) { Text("No, gracias") }
                }
            }
        }
    }

    private fun tickDown(onTick: (Int) -> Unit) {
        var remaining = MAX_RECORD_SECONDS
        val handler = Handler(Looper.getMainLooper())
        val runnable = object : Runnable {
            override fun run() {
                remaining--
                onTick(remaining)
                if (remaining > 0) handler.postDelayed(this, 1000)
            }
        }
        handler.postDelayed(runnable, 1000)
    }

    private fun startRecordingFlow(onStarted: () -> Unit) {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            startRecording()
            onStarted()
        } else {
            pendingRecordStart = { startRecording(); onStarted() }
            requestMicPermission.launch(Manifest.permission.RECORD_AUDIO)
        }
    }

    private fun startRecording() {
        val file = File(cacheDir, "sos_${System.currentTimeMillis()}.m4a")
        audioFile = file
        recorder = (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MediaRecorder(this) else @Suppress("DEPRECATION") MediaRecorder()).apply {
            setAudioSource(MediaRecorder.AudioSource.MIC)
            setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            setAudioEncodingBitRate(32_000) // clips cortos y livianos para mandar por la red del celu
            setOutputFile(file.absolutePath)
            runCatching { prepare(); start() }
        }
    }

    private fun stopRecording() {
        runCatching { recorder?.stop(); recorder?.release() }
        recorder = null
    }

    private suspend fun sendSosAlert(): String? {
        val fusedClient = LocationServices.getFusedLocationProviderClient(this)
        val location = runCatching { fusedClient.lastLocation.await() }.getOrNull() ?: return null
        val api = ApiClient.create(prefs)
        return runCatching {
            val response = api.sendSos(SosRequest(location.latitude, location.longitude, "Botón de pánico activado"))
            if (response.isSuccessful) response.body()?.alert?.id else null
        }.getOrNull()
    }

    private suspend fun uploadRecording(alertId: String?) {
        val file = audioFile ?: return
        val id = alertId ?: return
        if (!file.exists() || file.length() == 0L) return
        val base64 = android.util.Base64.encodeToString(file.readBytes(), android.util.Base64.NO_WRAP)
        val api = ApiClient.create(prefs)
        runCatching { api.uploadSosAudio(id, SosAudioRequest(base64)) }
        runCatching { file.delete() }
    }

    companion object {
        private const val MAX_RECORD_SECONDS = 15
    }
}
