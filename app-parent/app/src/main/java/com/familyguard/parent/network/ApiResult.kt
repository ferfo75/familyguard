package com.familyguard.parent.network

import kotlinx.coroutines.delay
import retrofit2.Response
import java.io.IOException
import kotlin.coroutines.cancellation.CancellationException

/**
 * Resultado de una llamada al servidor, para que las pantallas puedan
 * distinguir "no hay datos" de "no pudimos pedirlos". Confundir las dos cosas
 * era lo que hacía parecer que los hijos se habían borrado.
 */
sealed interface ApiResult<out T> {
    data class Ok<T>(val value: T) : ApiResult<T>
    data class Failure(val kind: Kind, val detail: String) : ApiResult<Nothing> {
        /** Texto para mostrarle a una persona, sin jerga. */
        fun userMessage(): String = when (kind) {
            Kind.Unauthorized -> "Tu sesión venció. Volvé a ingresar."
            Kind.Offline -> "No hay conexión con el servidor."
            Kind.Server -> "El servidor no responde todavía (puede estar despertando)."
            Kind.Other -> "Ocurrió un error ($detail)."
        }
    }
    enum class Kind { Offline, Server, Unauthorized, Other }
}

// Render (plan gratis) puede tardar ~50 s en despertar: un solo intento fallaba
// justo en ese caso. Se reintenta 2 veces más, esperando un poco entre intentos.
private val RETRY_DELAYS_MS = longArrayOf(0L, 3_000L, 8_000L)

suspend fun <T : Any> callWithRetry(
    attempts: Int = RETRY_DELAYS_MS.size,
    block: suspend () -> Response<T>,
): ApiResult<T> {
    var last: ApiResult.Failure = ApiResult.Failure(ApiResult.Kind.Other, "sin intentos")
    for (i in 0 until attempts.coerceAtMost(RETRY_DELAYS_MS.size)) {
        if (RETRY_DELAYS_MS[i] > 0) delay(RETRY_DELAYS_MS[i])
        try {
            val response = block()
            if (response.isSuccessful) {
                val body = response.body()
                return if (body != null) ApiResult.Ok(body)
                else ApiResult.Failure(ApiResult.Kind.Other, "respuesta vacía")
            }
            when (response.code()) {
                401 -> return ApiResult.Failure(ApiResult.Kind.Unauthorized, "401")
                in 500..599, 408, 429 ->
                    last = ApiResult.Failure(ApiResult.Kind.Server, "HTTP ${response.code()}")
                else -> return ApiResult.Failure(ApiResult.Kind.Other, "HTTP ${response.code()}")
            }
        } catch (e: CancellationException) {
            throw e // no se traga la cancelación de la corrutina
        } catch (e: IOException) {
            last = ApiResult.Failure(ApiResult.Kind.Offline, e.message ?: "sin conexión")
        } catch (e: Exception) {
            return ApiResult.Failure(ApiResult.Kind.Other, e.message ?: "error inesperado")
        }
    }
    return last
}
