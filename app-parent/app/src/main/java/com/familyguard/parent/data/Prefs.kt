package com.familyguard.parent.data

import android.content.Context
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "familyguard_parent_prefs")

class Prefs(private val context: Context) {
    private object Keys {
        val TOKEN = stringPreferencesKey("parent_token")
        val NAME = stringPreferencesKey("parent_name")
    }

    val isLoggedIn: Flow<Boolean> = context.dataStore.data.map { it[Keys.TOKEN] != null }
    val tokenFlow: Flow<String?> = context.dataStore.data.map { it[Keys.TOKEN] }

    suspend fun tokenOrNull(): String? = context.dataStore.data.first()[Keys.TOKEN]

    suspend fun saveSession(token: String, name: String) {
        context.dataStore.edit {
            it[Keys.TOKEN] = token
            it[Keys.NAME] = name
        }
    }

    suspend fun clear() {
        context.dataStore.edit { it.clear() }
    }
}
