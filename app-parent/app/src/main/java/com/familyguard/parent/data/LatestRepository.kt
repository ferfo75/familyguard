package com.familyguard.parent.data

import com.familyguard.parent.network.ApiClient
import com.familyguard.parent.network.ApiResult
import com.familyguard.parent.network.ChildLatest
import com.familyguard.parent.network.LatestLocation
import com.familyguard.parent.network.callWithRetry
import com.google.gson.Gson
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * Única fuente de verdad de "qué hijos hay y dónde están", compartida por
 * Inicio y Mapa. Antes cada pantalla pedía los datos por su cuenta, una sola
 * vez, y si el pedido fallaba mostraba "no agregaste ningún hijo": parecía que
 * se habían borrado. Acá se distingue cargando / error / vacío de verdad, se
 * reintenta, y se guarda la última lista buena para mostrarla mientras tanto.
 */
object LatestRepository {
    enum class Phase { Idle, Loading, Ready, Error }

    data class State(
        val children: List<ChildLatest> = emptyList(),
        val phase: Phase = Phase.Idle,
        /** true si la lista viene de la memoria del teléfono y no del servidor. */
        val fromCache: Boolean = false,
        /** Cuándo se obtuvo la lista que se está mostrando. */
        val updatedAtMs: Long? = null,
        val error: String? = null,
    )

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val gson = Gson()
    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    @Volatile private var job: Job? = null
    @Volatile private var cacheLoaded = false
    @Volatile private var lastPrefs: Prefs? = null

    fun refresh(prefs: Prefs) {
        lastPrefs = prefs
        if (job?.isActive == true) return
        job = scope.launch {
            if (!cacheLoaded) {
                cacheLoaded = true
                loadCache(prefs)
            }
            _state.update { it.copy(phase = Phase.Loading, error = null) }
            val api = ApiClient.create(prefs)
            when (val result = callWithRetry { api.getLatestLocations() }) {
                is ApiResult.Ok -> {
                    val list = result.value.children
                    val now = System.currentTimeMillis()
                    _state.value = State(list, Phase.Ready, fromCache = false, updatedAtMs = now)
                    runCatching { prefs.saveLatestCache(gson.toJson(list), now) }
                }
                is ApiResult.Failure -> {
                    // Se conserva la lista que ya había (caché o último dato bueno).
                    _state.update { it.copy(phase = Phase.Error, error = result.userMessage()) }
                }
            }
        }
    }

    private suspend fun loadCache(prefs: Prefs) {
        val cached = prefs.latestCache() ?: return
        val list = runCatching { gson.fromJson(cached.first, Array<ChildLatest>::class.java)?.toList() }.getOrNull()
        if (!list.isNullOrEmpty() && _state.value.children.isEmpty()) {
            _state.update { it.copy(children = list, fromCache = true, updatedAtMs = cached.second) }
        }
    }

    /** Llegó una ubicación en vivo por socket: se pisa solo ese hijo, con su nombre real. */
    fun applyLive(json: JSONObject) {
        val id = json.optString("childDeviceId")
        if (id.isEmpty()) return
        val lat = json.optDouble("lat")
        val lng = json.optDouble("lng")
        if (lat.isNaN() || lng.isNaN()) return
        val speed = if (json.has("speedMs") && !json.isNull("speedMs")) json.optDouble("speedMs").toFloat() else null
        val activity = if (json.has("activityType") && !json.isNull("activityType")) json.optString("activityType") else null
        val battery = if (json.has("batteryLevel") && !json.isNull("batteryLevel")) json.optInt("batteryLevel") else null
        val nowIso = java.time.Instant.now().toString()

        var known = false
        _state.update { s ->
            val updated = s.children.map { c ->
                if (c.childDeviceId != id) c else {
                    known = true
                    c.copy(
                        batteryLevel = battery ?: c.batteryLevel,
                        lastSeenAt = nowIso,
                        location = LatestLocation(lat, lng, speed, activity, nowIso),
                    )
                }
            }
            s.copy(children = updated, fromCache = false, updatedAtMs = System.currentTimeMillis())
        }
        // Un hijo que no conocíamos (se emparejó después de la última carga): se vuelve a pedir la lista.
        if (!known) lastPrefs?.let { refresh(it) }
    }

    fun removeChild(childDeviceId: String) {
        _state.update { s -> s.copy(children = s.children.filterNot { it.childDeviceId == childDeviceId }) }
    }

    /** Al cerrar sesión no debe quedar nada del usuario anterior en memoria. */
    fun reset() {
        job?.cancel()
        cacheLoaded = false
        _state.value = State()
    }
}
