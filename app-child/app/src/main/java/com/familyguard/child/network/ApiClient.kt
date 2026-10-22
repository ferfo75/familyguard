package com.familyguard.child.network

import com.familyguard.child.BuildConfig
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Response
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import com.familyguard.child.data.Prefs

/** Agrega el deviceToken guardado a toda request, salvo el propio emparejamiento. */
class AuthInterceptor(private val prefs: Prefs) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val original = chain.request()
        if (original.url.encodedPath.contains("pairing/redeem")) return chain.proceed(original)

        val token = runBlocking { prefs.deviceTokenOrNull() }
        val request = if (token != null) {
            original.newBuilder().addHeader("Authorization", "Bearer $token").build()
        } else original
        return chain.proceed(request)
    }
}

object ApiClient {
    fun create(prefs: Prefs): ApiService {
        val client = OkHttpClient.Builder()
            .addInterceptor(AuthInterceptor(prefs))
            .build()

        return Retrofit.Builder()
            .baseUrl(BuildConfig.API_BASE_URL)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(ApiService::class.java)
    }
}
