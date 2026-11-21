package com.familyguard.child.data

import android.content.Context
import com.familyguard.child.network.ApiService
import com.familyguard.child.network.LocationPingRequest
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import kotlinx.coroutines.sync.Mutex
import java.time.Instant

/**
 * Bandeja de salida de ubicaciones. Antes, si un ping fallaba (sin señal, o el
 * servidor gratuito todavía dormido) se descartaba en silencio y ese tramo del
 * recorrido se perdía para siempre. Ahora queda guardado en el teléfono y se
 * reenvía, en orden y con su hora real, apenas hay conexión.
 *
 * Guarda como máximo [MAX_PENDING] puntos (unas 5 horas a 1 por minuto) y descarta
 * los de más de [MAX_AGE_MS]: el servidor ya no acepta nada de más de 48 horas.
 */
object PingOutbox {
    private const val FILE = "ping_outbox"
    private const val KEY = "pending"
    private const val MAX_PENDING = 300
    private const val MAX_AGE_MS = 47L * 3600 * 1000

    private val gson = Gson()
    private val listType = object : TypeToken<MutableList<LocationPingRequest>>() {}.type
    private val flushLock = Mutex()

    @Synchronized
    private fun load(context: Context): MutableList<LocationPingRequest> {
        val raw = context.getSharedPreferences(FILE, Context.MODE_PRIVATE).getString(KEY, null) ?: return mutableListOf()
        return runCatching { gson.fromJson<MutableList<LocationPingRequest>>(raw, listType) }.getOrNull() ?: mutableListOf()
    }

    @Synchronized
    private fun save(context: Context, list: List<LocationPingRequest>) {
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().putString(KEY, gson.toJson(list)).apply()
    }

    private fun isTooOld(ping: LocationPingRequest, now: Long): Boolean {
        val ts = ping.recordedAt?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() } ?: return false
        return now - ts > MAX_AGE_MS
    }

    @Synchronized
    fun add(context: Context, ping: LocationPingRequest) {
        val now = System.currentTimeMillis()
        val list = load(context).filterNot { isTooOld(it, now) }.toMutableList()
        list += ping
        while (list.size > MAX_PENDING) list.removeAt(0) // si se llena, se pierde lo más viejo
        save(context, list)
    }

    @Synchronized
    fun size(context: Context): Int = load(context).size

    @Synchronized
    private fun peek(context: Context, n: Int): List<LocationPingRequest> = load(context).take(n)

    @Synchronized
    private fun drop(context: Context, n: Int) {
        if (n <= 0) return
        val list = load(context)
        repeat(minOf(n, list.size)) { list.removeAt(0) }
        save(context, list)
    }

    /**
     * Reenvía lo pendiente, en orden, y se detiene en el primer fallo para no
     * perder el orden ni martillar a un servidor que todavía no responde.
     * Un rechazo permanente (4xx) se descarta: reintentarlo no lo arregla.
     */
    suspend fun flush(context: Context, api: ApiService, maxItems: Int = 60) {
        if (!flushLock.tryLock()) return // ya hay otro envío en curso (servicio y worker pueden coincidir)
        try {
            var sent = 0
            while (sent < maxItems) {
                val batch = peek(context, 10)
                if (batch.isEmpty()) return
                var done = 0
                for (ping in batch) {
                    val response = runCatching { api.sendLocationPing(ping) }.getOrNull()
                    val code = response?.code()
                    val delivered = response != null && (response.isSuccessful || isPermanentRejection(code))
                    if (!delivered) {
                        drop(context, done)
                        return
                    }
                    done++
                    sent++
                }
                drop(context, done)
            }
        } finally {
            flushLock.unlock()
        }
    }

    fun isPermanentRejection(code: Int?): Boolean = code != null && code in 400..499 && code != 408 && code != 429
}
