package com.familyguard.parent.update

import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import com.familyguard.parent.BuildConfig
import com.familyguard.parent.data.Prefs
import com.familyguard.parent.network.ApiClient
import com.familyguard.parent.network.AppVersionInfo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.net.URL

/** Mismo mecanismo que la app del hijo: revisa sola si hay versión nueva y,
 * si el padre confirma, descarga el APK y abre el instalador. */
object AppUpdater {

    suspend fun checkForUpdate(prefs: Prefs): AppVersionInfo? = withContext(Dispatchers.IO) {
        runCatching {
            val api = ApiClient.create(prefs)
            val response = api.getLatestAppVersion()
            val info = if (response.isSuccessful) response.body() else null
            if (info != null && info.versionCode > BuildConfig.VERSION_CODE) info else null
        }.getOrNull()
    }

    /**
     * Descarga el APK y abre el instalador de Android.
     * @return false si no se pudo descargar (sin red, servidor dormido, archivo cortado), para avisarle
     *         al usuario en vez de quedarse mudo como antes.
     */
    suspend fun downloadAndInstall(context: Context, info: AppVersionInfo): Boolean = withContext(Dispatchers.IO) {
        val baseUrl = BuildConfig.API_BASE_URL.removeSuffix("/")
        val fullUrl = if (info.downloadUrl.startsWith("http")) info.downloadUrl else "$baseUrl${info.downloadUrl}"

        val file = File(context.cacheDir, "update.apk")
        val part = File(context.cacheDir, "update.apk.part")
        val ok = runCatching {
            // Render free puede tardar ~50 s en despertar: timeouts generosos, pero con tope.
            val conn = (URL(fullUrl).openConnection() as java.net.HttpURLConnection).apply {
                connectTimeout = 60_000
                readTimeout = 60_000
            }
            if (conn.responseCode != 200) error("http ${conn.responseCode}")
            conn.inputStream.use { input -> part.outputStream().use { output -> input.copyTo(output) } }
            val expected = conn.contentLengthLong
            // Un APK real pesa varios MB; y si el servidor dijo cuánto pesaba, tiene que coincidir.
            if (part.length() < 1_000_000L || (expected > 0 && part.length() != expected)) error("archivo incompleto")
            file.delete()
            if (!part.renameTo(file)) error("no se pudo guardar")
        }.isSuccess
        if (!ok) { part.delete(); return@withContext false }

        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        withContext(Dispatchers.Main) {
            runCatching { context.startActivity(intent) }
        }
        true
    }
}
