package com.familyguard.parent.data

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "familyguard_parent_prefs")

class Prefs(private val context: Context) {
    private object Keys {
        val TOKEN = stringPreferencesKey("parent_token")
        val NAME = stringPreferencesKey("parent_name")
        /** Se prende cuando el servidor rechaza el token (401): el login lo muestra. */
        val SESSION_EXPIRED = booleanPreferencesKey("session_expired")
        /** Última lista de hijos recibida OK, para mostrarla si después falla la carga. */
        val LATEST_JSON = stringPreferencesKey("latest_json")
        val LATEST_SAVED_AT = longPreferencesKey("latest_saved_at")
        val LAST_TOKEN_REFRESH_AT = longPreferencesKey("last_token_refresh_at")
    }

    val isLoggedIn: Flow<Boolean> = context.dataStore.data.map { it[Keys.TOKEN] != null }
    val tokenFlow: Flow<String?> = context.dataStore.data.map { it[Keys.TOKEN] }
    val sessionExpired: Flow<Boolean> = context.dataStore.data.map { it[Keys.SESSION_EXPIRED] == true }
    val nameFlow: Flow<String?> = context.dataStore.data.map { it[Keys.NAME] }

    suspend fun tokenOrNull(): String? = context.dataStore.data.first()[Keys.TOKEN]

    suspend fun saveSession(token: String, name: String) {
        context.dataStore.edit {
            it[Keys.TOKEN] = token
            it[Keys.NAME] = name
            it[Keys.SESSION_EXPIRED] = false
            it[Keys.LAST_TOKEN_REFRESH_AT] = System.currentTimeMillis()
        }
    }

    /**
     * El servidor dijo 401: el token venció o ya no sirve. Se cierra la sesión
     * (la app vuelve sola al login) y se borra la caché de hijos, que es
     * información privada y no debe quedar a la vista de otra cuenta.
     */
    suspend fun expireSession() {
        context.dataStore.edit {
            it.remove(Keys.TOKEN)
            it.remove(Keys.NAME)
            it.remove(Keys.LATEST_JSON)
            it.remove(Keys.LATEST_SAVED_AT)
            it[Keys.SESSION_EXPIRED] = true
        }
    }

    suspend fun lastTokenRefreshAt(): Long = context.dataStore.data.first()[Keys.LAST_TOKEN_REFRESH_AT] ?: 0L

    suspend fun saveLatestCache(json: String, savedAtMs: Long) {
        context.dataStore.edit {
            it[Keys.LATEST_JSON] = json
            it[Keys.LATEST_SAVED_AT] = savedAtMs
        }
    }

    suspend fun latestCache(): Pair<String, Long>? {
        val data = context.dataStore.data.first()
        val json = data[Keys.LATEST_JSON] ?: return null
        return json to (data[Keys.LATEST_SAVED_AT] ?: 0L)
    }

    suspend fun clear() {
        context.dataStore.edit { it.clear() }
    }
}
