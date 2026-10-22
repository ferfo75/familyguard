package com.familyguard.parent.util

import android.content.Context
import android.content.Intent
import android.net.Uri

/**
 * Abre un navegador GPS externo (Google Maps o Waze) con indicaciones hacia
 * la ubicación del hijo/a. Intenta primero el esquema que abre la app
 * directamente con navegación activada; si no está instalada, cae a la URL
 * web, que a su vez ofrece instalarla.
 */
object NavigationIntents {

    fun openGoogleMapsDirections(context: Context, lat: Double, lng: Double) {
        val appIntent = Intent(Intent.ACTION_VIEW, Uri.parse("google.navigation:q=$lat,$lng&mode=d")).apply {
            setPackage("com.google.android.apps.maps")
        }
        if (appIntent.resolveActivity(context.packageManager) != null) {
            context.startActivity(appIntent)
            return
        }
        val webIntent = Intent(
            Intent.ACTION_VIEW,
            Uri.parse("https://www.google.com/maps/dir/?api=1&destination=$lat,$lng&travelmode=driving")
        )
        context.startActivity(webIntent)
    }

    fun openWazeDirections(context: Context, lat: Double, lng: Double) {
        val appIntent = Intent(Intent.ACTION_VIEW, Uri.parse("waze://?ll=$lat,$lng&navigate=yes"))
        if (appIntent.resolveActivity(context.packageManager) != null) {
            context.startActivity(appIntent)
            return
        }
        val webIntent = Intent(Intent.ACTION_VIEW, Uri.parse("https://waze.com/ul?ll=$lat,$lng&navigate=yes"))
        context.startActivity(webIntent)
    }

    /** Deja que el usuario elija entre todas las apps de mapas que tenga instaladas. */
    fun openChooser(context: Context, lat: Double, lng: Double, label: String) {
        val uri = Uri.parse("geo:$lat,$lng?q=$lat,$lng(${Uri.encode(label)})")
        val intent = Intent(Intent.ACTION_VIEW, uri)
        val chooser = Intent.createChooser(intent, "Ir hasta ahí con…")
        context.startActivity(chooser)
    }
}
