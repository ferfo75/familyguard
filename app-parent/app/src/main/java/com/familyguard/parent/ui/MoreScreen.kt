package com.familyguard.parent.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.SportsEsports
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.familyguard.parent.network.ChildLatest
import com.familyguard.parent.ui.theme.MemberColors

/** "Más": lo que antes era una pestaña por separado (Zonas, Uso de apps, SOS), para que la barra inferior no se sature. */
@Composable
fun MoreScreen(children: List<ChildLatest>, onGames: () -> Unit, onZones: () -> Unit, onSos: () -> Unit, onUsage: (ChildLatest) -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        Text("Más opciones", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(12.dp))
        MoreCard(Icons.Filled.SportsEsports, "Juegos en familia", "Truco y Ludo para jugar todos juntos, cada uno desde su celular.", onGames)
        Spacer(Modifier.height(10.dp))
        MoreCard(Icons.Filled.Shield, "Zonas", "Casa, colegio… y avisos cuando llegan o se van.", onZones)
        Spacer(Modifier.height(10.dp))
        MoreCard(Icons.Filled.Warning, "SOS", "Alertas de ayuda que mandaron tus hijos/as.", onSos, danger = true)
        Spacer(Modifier.height(18.dp))
        Text("Uso de apps", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(8.dp))
        if (children.isEmpty()) {
            Text("Cuando agregues a alguien, vas a poder ver cuánto usa cada app.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            children.forEachIndexed { index, child ->
                Card(
                    onClick = { onUsage(child) },
                    shape = MaterialTheme.shapes.medium,
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        FamilyAvatar(child.childName, MemberColors[index % MemberColors.size], size = 36.dp)
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(child.childName, style = MaterialTheme.typography.titleMedium)
                            Text("Ver y limitar sus apps", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Icon(Icons.Filled.Timer, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                Spacer(Modifier.height(8.dp))
            }
        }
    }
}

@Composable
private fun MoreCard(icon: ImageVector, title: String, subtitle: String, onClick: () -> Unit, danger: Boolean = false) {
    val accent = if (danger) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
    Card(
        onClick = onClick,
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, null, tint = accent)
            Spacer(Modifier.width(14.dp))
            Column {
                Text(title, style = MaterialTheme.typography.titleMedium)
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
