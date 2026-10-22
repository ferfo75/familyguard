package com.familyguard.child.data

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "familyguard_child_prefs")

/** Guarda localmente las credenciales del dispositivo luego de emparejarlo. */
class Prefs(private val context: Context) {

    private object Keys {
        val DEVICE_TOKEN = stringPreferencesKey("device_token")
        val CHILD_DEVICE_ID = stringPreferencesKey("child_device_id")
        val CHILD_NAME = stringPreferencesKey("child_name")
        val TRACKING_ENABLED = booleanPreferencesKey("tracking_enabled")
    }

    val isPaired: Flow<Boolean> = context.dataStore.data.map { it[Keys.DEVICE_TOKEN] != null }
    val deviceTokenFlow: Flow<String?> = context.dataStore.data.map { it[Keys.DEVICE_TOKEN] }
    val childNameFlow: Flow<String?> = context.dataStore.data.map { it[Keys.CHILD_NAME] }

    suspend fun deviceTokenOrNull(): String? = context.dataStore.data.first()[Keys.DEVICE_TOKEN]

    suspend fun savePairing(deviceToken: String, childDeviceId: String, childName: String) {
        context.dataStore.edit {
            it[Keys.DEVICE_TOKEN] = deviceToken
            it[Keys.CHILD_DEVICE_ID] = childDeviceId
            it[Keys.CHILD_NAME] = childName
            it[Keys.TRACKING_ENABLED] = true
        }
    }

    suspend fun clear() {
        context.dataStore.edit { it.clear() }
    }
}
