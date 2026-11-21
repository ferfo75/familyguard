package com.familyguard.child.ui

import android.annotation.SuppressLint
import android.graphics.Color
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import com.familyguard.child.BuildConfig
import com.familyguard.child.data.Prefs

/**
 * Juegos en familia (Truco y Ludo). La pantalla es una página servida por el backend, que arbitra
 * las partidas; acá solo se muestra. El token viaja en el fragmento de la URL (#t=…), que no se envía al servidor.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun GamesTab(prefs: Prefs) {
    val token by prefs.deviceTokenFlow.collectAsState(initial = null)
    val t = token
    if (t == null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        return
    }
    val url = BuildConfig.API_BASE_URL.removeSuffix("/") + "/games/index.html#t=" + t
    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = { ctx ->
            WebView(ctx).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.allowFileAccess = false
                settings.allowContentAccess = false
                setBackgroundColor(Color.TRANSPARENT)
                webViewClient = WebViewClient()
                loadUrl(url)
            }
        },
        onRelease = { it.destroy() },
    )
}
