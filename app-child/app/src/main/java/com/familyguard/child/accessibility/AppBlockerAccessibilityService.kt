package com.familyguard.child.accessibility

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.view.accessibility.AccessibilityEvent
import com.familyguard.child.data.Prefs
import com.familyguard.child.network.ApiClient
import com.familyguard.child.network.BlockedAppRule
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.util.Calendar
import java.util.concurrent.TimeUnit

/**
 * Detecta qué app pasó a primer plano y aplica las reglas que configuró el
 * padre: bloqueo total o límite diario de minutos. El usuario debe activar
 * este servicio a mano en Ajustes > Accesibilidad — Android no permite
 * activarlo por código, es una protección del sistema.
 */
class AppBlockerAccessibilityService : AccessibilityService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var rules: List<BlockedAppRule> = emptyList()
    private val minutesUsedToday = mutableMapOf<String, Int>()
    private var lastRefresh = 0L
    private var currentDay = -1

    override fun onServiceConnected() {
        super.onServiceConnected()
        refreshRules()
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        if (event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
        val packageName = event.packageName?.toString() ?: return
        resetCounterIfNewDay()

        if (System.currentTimeMillis() - lastRefresh > TimeUnit.MINUTES.toMillis(10)) refreshRules()

        val rule = rules.firstOrNull { it.packageName == packageName } ?: return
        if (rule.dailyLimitMin == null) {
            goHome()
            return
        }
        val used = minutesUsedToday[packageName] ?: 0
        if (used >= rule.dailyLimitMin) {
            goHome()
        }
        // Nota: el conteo de minutos usados se nutre de los reportes diarios que ya
        // sube UsageReportWorker; este servicio solo decide "bloquear ahora sí/no".
    }

    private fun resetCounterIfNewDay() {
        val today = Calendar.getInstance().get(Calendar.DAY_OF_YEAR)
        if (today != currentDay) {
            currentDay = today
            minutesUsedToday.clear()
        }
    }

    private fun goHome() {
        performGlobalAction(GLOBAL_ACTION_HOME)
    }

    private fun refreshRules() {
        lastRefresh = System.currentTimeMillis()
        scope.launch {
            val prefs = Prefs(applicationContext)
            val api = ApiClient.create(prefs)
            runCatching { api.getBlockedApps() }.getOrNull()?.body()?.let {
                rules = it.rules
            }
        }
    }

    override fun onInterrupt() {}
}
