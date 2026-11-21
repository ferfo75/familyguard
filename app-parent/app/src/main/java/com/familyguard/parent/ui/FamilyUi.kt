package com.familyguard.parent.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BatteryAlert
import androidx.compose.material.icons.filled.BatteryFull
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.familyguard.parent.data.LatestRepository
import com.familyguard.parent.network.ChildLatest
import com.familyguard.parent.util.TimeAgo

/** Estado de carga de una pantalla que pide datos al servidor. */
enum class LoadPhase { Loading, Ready, Error }

/** Franja de error cuando falla una actualización pero todavía hay datos para mostrar. */
@Composable
fun ErrorStrip(message: String?, onRetry: () -> Unit) {
    Surface(color = MaterialTheme.colorScheme.errorContainer, modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(start = 16.dp, end = 8.dp, top = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("No pudimos actualizar", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onErrorContainer)
                Text(message.orEmpty(), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onErrorContainer)
            }
            TextButton(onClick = onRetry) { Text("Reintentar") }
        }
    }
}

/** Círculo con la inicial del nombre, en el color propio de cada integrante. */
@Composable
fun FamilyAvatar(name: String, color: Color, size: Dp = 52.dp, modifier: Modifier = Modifier) {
    Box(
        modifier.size(size).clip(CircleShape).background(color),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            name.trim().take(1).uppercase().ifEmpty { "?" },
            color = Color.White,
            fontFamily = FontFamily.Serif,
            fontWeight = FontWeight.Bold,
            fontSize = (size.value * 0.42f).sp,
        )
    }
}

@Composable
fun freshnessColor(f: TimeAgo.Freshness): Color = when (f) {
    TimeAgo.Freshness.Fresh -> MaterialTheme.colorScheme.secondary
    TimeAgo.Freshness.Aging -> MaterialTheme.colorScheme.tertiary
    TimeAgo.Freshness.Stale -> MaterialTheme.colorScheme.error
    TimeAgo.Freshness.Unknown -> MaterialTheme.colorScheme.onSurfaceVariant
}

fun presenceText(f: TimeAgo.Freshness, lastSeenIso: String?, now: Long): String = when (f) {
    TimeAgo.Freshness.Fresh -> "En línea"
    TimeAgo.Freshness.Aging -> "Visto ${TimeAgo.text(lastSeenIso, now)}"
    TimeAgo.Freshness.Stale -> "Sin señal ${TimeAgo.text(lastSeenIso, now)}"
    TimeAgo.Freshness.Unknown -> "Todavía no reportó"
}

/** Lo que detecta Google Play Services es una estimación, por eso se dice "parece". */
fun activityLabel(type: String?): String? = when (type) {
    "walking" -> "🚶 Caminando"
    "running" -> "🏃 Corriendo"
    "bicycle" -> "🚲 En bici"
    "vehicle" -> "🚗 En auto"
    "still" -> "🧍 Quieto"
    else -> null
}

/**
 * Problemas del teléfono del hijo/a que explican (o van a provocar) que deje de reportar.
 * Es lo que más importa en Motorola: la batería restringida por el fabricante.
 */
fun healthIssues(child: ChildLatest, now: Long): List<String> {
    val out = mutableListOf<String>()
    val h = child.health
    if (h?.batteryUnrestricted == false) out += "Batería restringida: el teléfono puede cortar el seguimiento"
    if (h?.backgroundLocation == false) out += "Falta el permiso de ubicación “todo el tiempo”"
    if (h?.locationEnabled == false) out += "El GPS del teléfono está apagado"
    // La app sigue viva (latido reciente) pero no llegan ubicaciones.
    val heartbeatMs = TimeAgo.parse(child.lastHeartbeatAt)
    val heartbeatRecent = heartbeatMs != null && now - heartbeatMs < 40 * 60_000L
    if (heartbeatRecent && TimeAgo.freshness(child.lastSeenAt, now) != TimeAgo.Freshness.Fresh) {
        out += "La app está activa pero no manda ubicación"
    }
    return out
}

/** Estado de un vistazo: punto de color + texto, sobre un fondo suave del mismo color. */
@Composable
fun StatusPill(freshness: TimeAgo.Freshness, text: String, modifier: Modifier = Modifier) {
    val color = freshnessColor(freshness)
    Row(
        modifier.clip(RoundedCornerShape(50)).background(color.copy(alpha = 0.14f))
            .padding(horizontal = 10.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(8.dp).clip(CircleShape).background(color))
        Spacer(Modifier.width(6.dp))
        Text(text, color = color, style = MaterialTheme.typography.labelLarge)
    }
}

@Composable
fun BatteryChip(level: Int, modifier: Modifier = Modifier) {
    val low = level <= 20
    val color = if (low) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        Icon(if (low) Icons.Filled.BatteryAlert else Icons.Filled.BatteryFull, null, tint = color, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(2.dp))
        Text("$level%", color = color, style = MaterialTheme.typography.bodySmall)
    }
}

/** Resumen arriba de todo: "todo en orden" o quién necesita atención, sin tener que mirar tarjeta por tarjeta. */
@Composable
fun FamilySummaryCard(parentName: String?, children: List<ChildLatest>, now: Long) {
    val stale = children.filter { TimeAgo.freshness(it.lastSeenAt, now) == TimeAgo.Freshness.Stale }
    val aging = children.filter { TimeAgo.freshness(it.lastSeenAt, now) == TimeAgo.Freshness.Aging }
    // Todavía no mandó ninguna ubicación: no es "al día" ni "sin señal", es "esperando".
    val unknown = children.filter { TimeAgo.freshness(it.lastSeenAt, now) == TimeAgo.Freshness.Unknown }
    fun names(list: List<ChildLatest>) = when (list.size) {
        1 -> list[0].childName
        else -> list.dropLast(1).joinToString(", ") { it.childName } + " y " + list.last().childName
    }
    val (container, onContainer, headline, detail) = when {
        stale.isNotEmpty() -> SummaryText(
            MaterialTheme.colorScheme.errorContainer, MaterialTheme.colorScheme.onErrorContainer,
            "Atención",
            "${names(stale)} ${if (stale.size == 1) "no reporta" else "no reportan"} hace más de 2 horas. Conviene llamar o revisar el teléfono: abrir la app FamilyGuard en su celular suele reactivarla.",
        )
        aging.isNotEmpty() -> SummaryText(
            MaterialTheme.colorScheme.tertiaryContainer, MaterialTheme.colorScheme.onTertiaryContainer,
            "Un rato sin novedades",
            "${names(aging)} ${if (aging.size == 1) "no manda" else "no mandan"} ubicación hace un momento.",
        )
        unknown.size == children.size -> SummaryText(
            MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.colorScheme.onSurfaceVariant,
            "Esperando noticias",
            "${names(unknown)} todavía no ${if (unknown.size == 1) "mandó" else "mandaron"} su ubicación.",
        )
        else -> SummaryText(
            MaterialTheme.colorScheme.secondaryContainer, MaterialTheme.colorScheme.onSecondaryContainer,
            "Todo en orden",
            when {
                unknown.isNotEmpty() -> "Quienes ya reportaron están al día. ${names(unknown)} todavía no ${if (unknown.size == 1) "mandó" else "mandaron"} su ubicación."
                children.size == 1 -> "${children[0].childName} reportó hace poco."
                else -> "Los ${children.size} chicos/as reportaron hace poco."
            },
        )
    }
    Surface(color = container, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(20.dp)) {
            if (!parentName.isNullOrBlank()) {
                Text("Hola, $parentName", style = MaterialTheme.typography.bodyMedium, color = onContainer.copy(alpha = 0.8f))
                Spacer(Modifier.height(2.dp))
            }
            Text(headline, style = MaterialTheme.typography.headlineSmall, color = onContainer)
            Spacer(Modifier.height(4.dp))
            Text(detail, style = MaterialTheme.typography.bodyMedium, color = onContainer)
        }
    }
}

private data class SummaryText(val container: Color, val onContainer: Color, val headline: String, val detail: String)

/** Aviso cuando no se pudo actualizar (se siguen mostrando los últimos datos) o cuando está actualizando. */
@Composable
fun ConnectionBanner(state: LatestRepository.State, modifier: Modifier = Modifier, onRetry: () -> Unit) {
    when (state.phase) {
        LatestRepository.Phase.Error -> Surface(color = MaterialTheme.colorScheme.errorContainer, modifier = modifier.fillMaxWidth()) {
            Row(Modifier.padding(start = 16.dp, end = 8.dp, top = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("No pudimos actualizar", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onErrorContainer)
                    val saved = state.updatedAtMs?.let {
                        val ago = TimeAgo.textFromMs(it).let { t -> if (t == "ahora") "recién" else t }
                        "Mostrando datos guardados ($ago)."
                    } ?: "Mostrando los últimos datos conocidos."
                    Text("$saved ${state.error.orEmpty()}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onErrorContainer)
                }
                TextButton(onClick = onRetry) { Text("Reintentar") }
            }
        }
        LatestRepository.Phase.Loading -> Column(modifier.fillMaxWidth()) {
            LinearProgressIndicator(Modifier.fillMaxWidth())
            Text(
                "Actualizando… si el servidor estaba dormido puede tardar hasta un minuto.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
            )
        }
        else -> Unit
    }
}

@Composable
fun LoadingPane(modifier: Modifier = Modifier) {
    Column(
        modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        CircularProgressIndicator()
        Spacer(Modifier.height(16.dp))
        Text("Conectando con el servidor…", style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(4.dp))
        Text(
            "Si estaba dormido puede tardar hasta un minuto. No se borró nada.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
fun CenterMessage(title: String, body: String, modifier: Modifier = Modifier, action: String? = null, onAction: () -> Unit = {}) {
    Column(
        modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(title, style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center)
        Spacer(Modifier.height(8.dp))
        Text(body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
        if (action != null) {
            Spacer(Modifier.height(16.dp))
            Button(onClick = onAction) { Text(action) }
        }
    }
}
