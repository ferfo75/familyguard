package com.familyguard.child.worker

import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.pm.PackageManager
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.familyguard.child.data.Prefs
import com.familyguard.child.network.ApiClient
import com.familyguard.child.network.UsageAppEntry
import com.familyguard.child.network.UsageReportRequest
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.concurrent.TimeUnit

/**
 * Corre una vez por día (programado desde MainActivity con WorkManager) y
 * sube el acumulado de uso por app de hoy. Requiere que el usuario haya
 * otorgado a mano el permiso "Acceso a datos de uso" (no es un permiso
 * normal, Android no deja pedirlo con un diálogo estándar).
 */
class UsageReportWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val usageManager = applicationContext.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val pm = applicationContext.packageManager

        val calendar = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0)
        }
        val startOfDay = calendar.timeInMillis
        val now = System.currentTimeMillis()

        val stats = usageManager.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, startOfDay, now)
        val entries = stats
            .filter { it.totalTimeInForeground > TimeUnit.SECONDS.toMillis(30) } // ignora ruido
            .map { stat ->
                UsageAppEntry(
                    packageName = stat.packageName,
                    appName = resolveAppLabel(pm, stat.packageName),
                    usageMinutes = (stat.totalTimeInForeground / 60_000L).toInt(),
                )
            }
        if (entries.isEmpty()) return Result.success()

        val dateStr = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(calendar.time)
        val prefs = Prefs(applicationContext)
        val api = ApiClient.create(prefs)

        return runCatching {
            api.reportUsage(UsageReportRequest(dateStr, entries))
        }.fold(onSuccess = { Result.success() }, onFailure = { Result.retry() })
    }

    private fun resolveAppLabel(pm: PackageManager, packageName: String): String =
        runCatching { pm.getApplicationLabel(pm.getApplicationInfo(packageName, 0)).toString() }
            .getOrDefault(packageName)
}
