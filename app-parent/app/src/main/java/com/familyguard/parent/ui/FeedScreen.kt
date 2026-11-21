package com.familyguard.parent.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.familyguard.parent.data.LatestRepository
import com.familyguard.parent.data.Prefs
import com.familyguard.parent.network.ApiClient
import com.familyguard.parent.network.ApiResult
import com.familyguard.parent.network.FeedEventDto
import com.familyguard.parent.network.callWithRetry
import com.familyguard.parent.ui.theme.MemberColors
import com.familyguard.parent.util.TimeAgo
import kotlinx.coroutines.launch

/** Novedades: "llegó bien", "va en camino", misiones terminadas y aprobadas, del más nuevo al más viejo. */
@Composable
fun FeedScreen(prefs: Prefs) {
    val scope = rememberCoroutineScope()
    val latest by LatestRepository.state.collectAsState()
    var events by remember { mutableStateOf<List<FeedEventDto>>(emptyList()) }
    var phase by remember { mutableStateOf(LoadPhase.Loading) }
    var error by remember { mutableStateOf<String?>(null) }

    fun reload() {
        scope.launch {
            phase = LoadPhase.Loading
            val api = ApiClient.create(prefs)
            when (val r = callWithRetry { api.getFeed() }) {
                is ApiResult.Ok -> { events = r.value.events; error = null; phase = LoadPhase.Ready }
                is ApiResult.Failure -> { error = r.userMessage(); phase = LoadPhase.Error }
            }
        }
    }
    LaunchedEffect(Unit) {
        LatestRepository.refresh(prefs)
        reload()
    }

    Column(Modifier.fillMaxSize()) {
        if (phase == LoadPhase.Error && events.isNotEmpty()) ErrorStrip(error) { reload() }
        when {
            events.isEmpty() && phase == LoadPhase.Loading -> LoadingPane()
            events.isEmpty() && phase == LoadPhase.Error ->
                CenterMessage("No pudimos cargar las novedades", error.orEmpty(), action = "Reintentar", onAction = { reload() })
            events.isEmpty() -> CenterMessage(
                "Todo tranquilo por ahora",
                "Acá van a aparecer los “llegué bien”, los “voy en camino” y las misiones que termine tu familia.",
            )
            else -> LazyColumn(
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(events, key = { it.id }) { e ->
                    val index = latest.children.indexOfFirst { it.childDeviceId == e.childDeviceId }.coerceAtLeast(0)
                    FeedCard(e, MemberColors[index % MemberColors.size])
                }
            }
        }
    }
}

@Composable
private fun FeedCard(e: FeedEventDto, color: androidx.compose.ui.graphics.Color) {
    Card(
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.Top) {
            FamilyAvatar(e.childName, color, size = 40.dp)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(e.title, style = MaterialTheme.typography.titleMedium)
                if (e.body.isNotBlank()) Text(e.body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(TimeAgo.text(e.createdAt), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.outline)
            }
        }
    }
}
