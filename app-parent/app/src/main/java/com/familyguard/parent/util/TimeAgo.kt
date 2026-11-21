package com.familyguard.parent.util

import java.time.Instant
import java.time.OffsetDateTime

/** Formatos de "hace X" y qué tan fresco es un dato, para no mostrar horas crudas. */
object TimeAgo {
    enum class Freshness { Fresh, Aging, Stale, Unknown }

    fun parse(iso: String?): Long? {
        if (iso.isNullOrBlank()) return null
        return runCatching { Instant.parse(iso).toEpochMilli() }
            .recoverCatching { OffsetDateTime.parse(iso).toInstant().toEpochMilli() }
            .getOrNull()
    }

    fun textFromMs(ms: Long, now: Long = System.currentTimeMillis()): String {
        val min = ((now - ms) / 60_000L).coerceAtLeast(0)
        return when {
            min < 1 -> "ahora"
            min < 60 -> "hace $min min"
            min < 24 * 60 -> "hace ${min / 60} h"
            else -> "hace ${min / (24 * 60)} d"
        }
    }

    fun text(iso: String?, now: Long = System.currentTimeMillis()): String =
        parse(iso)?.let { textFromMs(it, now) } ?: "sin datos"

    /** Menos de 10 min = al día; hasta 2 h = atrasado; más = sin señal (mismo umbral del aviso del servidor). */
    fun freshness(iso: String?, now: Long = System.currentTimeMillis()): Freshness {
        val ms = parse(iso) ?: return Freshness.Unknown
        val min = (now - ms) / 60_000L
        return when {
            min < 10 -> Freshness.Fresh
            min < 120 -> Freshness.Aging
            else -> Freshness.Stale
        }
    }
}
