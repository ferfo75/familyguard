package com.familyguard.child.data

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.familyguard.child.network.ApiService
import com.familyguard.child.network.AppVersionInfo
import com.familyguard.child.network.BlockedAppsResponse
import com.familyguard.child.network.HeartbeatRequest
import com.familyguard.child.network.LocationPingRequest
import com.familyguard.child.network.RedeemPairingRequest
import com.familyguard.child.network.RedeemPairingResponse
import com.familyguard.child.network.SosAudioRequest
import com.familyguard.child.network.SosRequest
import com.familyguard.child.network.SosResponse
import com.familyguard.child.network.UsageReportRequest
import kotlinx.coroutines.runBlocking
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import retrofit2.Response
import java.io.IOException
import java.time.Instant
import java.time.temporal.ChronoUnit

/**
 * Pruebas de la bandeja de salida de ubicaciones: lo que garantiza que un ping que no
 * pudo salir (sin señal, servidor dormido) no se pierda y salga en orden.
 */
@RunWith(AndroidJUnit4::class)
class PingOutboxTest {

    private lateinit var context: Context

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        context.getSharedPreferences("ping_outbox", Context.MODE_PRIVATE).edit().clear().commit()
    }

    /** El punto número [i] se reconoce por su latitud; [ageMs] lo "envejece". */
    private fun ping(i: Int, ageMs: Long = 0L) = LocationPingRequest(
        lat = -34.0 - i / 1000.0, lng = -58.0, accuracyM = null, speedMs = null, batteryLevel = 50,
        recordedAt = Instant.now().minusMillis(ageMs).truncatedTo(ChronoUnit.MILLIS).toString(),
    )

    private fun index(p: LocationPingRequest) = Math.round((-34.0 - p.lat) * 1000).toInt()

    private fun ok(): Response<Unit> = Response.success(Unit)
    private fun code(c: Int): Response<Unit> = Response.error(c, "".toResponseBody(null))

    /** API simulada: [responder] decide qué responde a cada ping; null = se cae la red. */
    private class FakeApi(val responder: (LocationPingRequest) -> Response<Unit>?) : ApiService {
        val delivered = mutableListOf<LocationPingRequest>()
        var attempts = 0
        override suspend fun sendLocationPing(body: LocationPingRequest): Response<Unit> {
            attempts++
            val r = responder(body) ?: throw IOException("sin red")
            if (r.isSuccessful) delivered += body
            return r
        }
        override suspend fun redeemPairing(body: RedeemPairingRequest): Response<RedeemPairingResponse> = TODO()
        override suspend fun sendHeartbeat(body: HeartbeatRequest): Response<Unit> = TODO()
        override suspend fun sendSos(body: SosRequest): Response<SosResponse> = TODO()
        override suspend fun uploadSosAudio(id: String, body: SosAudioRequest): Response<Unit> = TODO()
        override suspend fun reportUsage(body: UsageReportRequest): Response<Unit> = TODO()
        override suspend fun getBlockedApps(): Response<BlockedAppsResponse> = TODO()
        override suspend fun getLatestAppVersion(): Response<AppVersionInfo> = TODO()
    }

    @Test
    fun sendsAllInOrderAndEmptiesOutbox() = runBlocking {
        (1..5).forEach { PingOutbox.add(context, ping(it)) }
        val api = FakeApi { ok() }
        PingOutbox.flush(context, api)
        assertEquals(listOf(1, 2, 3, 4, 5), api.delivered.map(::index))
        assertEquals(0, PingOutbox.size(context))
    }

    @Test
    fun stopsAtFirstFailureAndKeepsTheRest() = runBlocking {
        (1..5).forEach { PingOutbox.add(context, ping(it)) }
        val api = FakeApi { p -> if (index(p) == 3) null else ok() }
        PingOutbox.flush(context, api)
        assertEquals("salieron solo los dos primeros", listOf(1, 2), api.delivered.map(::index))
        assertEquals("quedan el 3, 4 y 5", 3, PingOutbox.size(context))
        assertEquals("no se siguió golpeando al servidor después del fallo", 3, api.attempts)

        // Vuelve la red: sale lo que faltaba, sin repetir y en el mismo orden.
        val api2 = FakeApi { ok() }
        PingOutbox.flush(context, api2)
        assertEquals(listOf(3, 4, 5), api2.delivered.map(::index))
        assertEquals(0, PingOutbox.size(context))
    }

    @Test
    fun serverErrorKeepsThePing() = runBlocking {
        PingOutbox.add(context, ping(1))
        val api = FakeApi { code(503) }
        PingOutbox.flush(context, api)
        assertEquals(1, PingOutbox.size(context))
        assertTrue(api.delivered.isEmpty())
    }

    @Test
    fun permanentRejectionIsDroppedWithoutBlockingOthers() = runBlocking {
        (1..3).forEach { PingOutbox.add(context, ping(it)) }
        val api = FakeApi { p -> if (index(p) == 2) code(400) else ok() }
        PingOutbox.flush(context, api)
        assertEquals("el 400 no se reintenta para siempre", listOf(1, 3), api.delivered.map(::index))
        assertEquals(0, PingOutbox.size(context))
    }

    @Test
    fun timeoutAndTooManyRequestsAreRetried() = runBlocking {
        PingOutbox.add(context, ping(1))
        PingOutbox.flush(context, FakeApi { code(429) })
        assertEquals(1, PingOutbox.size(context))
        PingOutbox.flush(context, FakeApi { code(408) })
        assertEquals(1, PingOutbox.size(context))
    }

    @Test
    fun keepsAtMost300NewestPings() {
        (1..320).forEach { PingOutbox.add(context, ping(it)) }
        assertEquals(300, PingOutbox.size(context))
        val api = FakeApi { ok() }
        runBlocking { PingOutbox.flush(context, api, maxItems = 1000) }
        assertEquals("se perdieron los 20 más viejos", 21, index(api.delivered.first()))
        assertEquals(320, index(api.delivered.last()))
    }

    @Test
    fun dropsPingsOlderThan47Hours() {
        PingOutbox.add(context, ping(1, ageMs = 50L * 3600 * 1000))
        PingOutbox.add(context, ping(2))
        assertEquals("el de 50 h se descarta al agregar uno nuevo (el servidor ya no lo acepta)", 1, PingOutbox.size(context))
    }

    @Test
    fun respectsMaxItemsPerFlush() = runBlocking {
        (1..30).forEach { PingOutbox.add(context, ping(it)) }
        val api = FakeApi { ok() }
        PingOutbox.flush(context, api, maxItems = 10)
        assertEquals(10, api.delivered.size)
        assertEquals(20, PingOutbox.size(context))
    }

    @Test
    fun survivesReadingFromStorage() {
        PingOutbox.add(context, ping(1))
        // Otro "arranque": se vuelve a leer desde el almacenamiento, no desde memoria.
        assertEquals(1, PingOutbox.size(context))
    }
}
