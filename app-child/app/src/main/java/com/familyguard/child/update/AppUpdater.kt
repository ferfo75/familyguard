package com.familyguard.child.update

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import com.familyguard.child.BuildConfig
import com.familyguard.child.data.Prefs
import com.familyguard.child.network.ApiClient
import com.familyguard.child.network.AppVersionInfo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.net.URL

/**
 * Le ahorra al padre tener que mandar el APK de nuevo por WhatsApp/USB cada
 * vez: la app del hijo pregunta sola si hay una versión más nueva, y si el
 * chico toca "Actualizar", la descarga y abre el instalador de Android —
 * ese último paso (confirmar "Instalar") Android no deja saltearlo.
 */
object AppUpdater {

    suspend fun checkForUpdate(prefs: Prefs): AppVersionInfo? = withContext(Dispatchers.IO) {
        runCatching {
            val api = ApiClient.create(prefs)
            val response = api.getLatestAppVersion()
            val info = if (response.isSuccessful) response.body() else null
            if (info != null && info.versionCode > BuildConfig.VERSION_CODE) info else null
        }.getOrNull()
    }

    suspend fun downloadAndInstall(context: Context, info: AppVersionInfo) = withContext(Dispatchers.IO) {
        val baseUrl = BuildConfig.API_BASE_URL.removeSuffix("/")
        val fullUrl = if (info.downloadUrl.startsWith("http")) info.downloadUrl else "$baseUrl${info.downloadUrl}"

        val file = File(context.cacheDir, "update.apk")
        runCatching {
            URL(fullUrl).openStream().use { input ->
                file.outputStream().use { output -> input.copyTo(output) }
            }
        }.onFailure { return@withContext }

        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        withContext(Dispatchers.Main) {
            runCatching { context.startActivity(intent) }
        }
    }
}
