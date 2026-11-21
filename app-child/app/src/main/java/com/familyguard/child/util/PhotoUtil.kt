package com.familyguard.child.util

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
import android.util.Base64
import java.io.ByteArrayOutputStream

/**
 * Prepara la foto de una misión: la reduce y la comprime a JPEG para que viaje rápido y
 * entre en el límite del servidor (≈450 KB). Una foto de cámara de 12 MP pesaría 15 veces más.
 */
object PhotoUtil {
    private const val MAX_SIDE = 1024
    private const val MAX_BYTES = 330_000 // en base64 ≈ 440 KB, por debajo del techo de 600 KB del servidor

    /** @return la imagen en base64, o null si no se pudo leer o no entra ni comprimida al mínimo. */
    fun encodeToBase64Jpeg(context: Context, uri: Uri): String? {
        val bitmap = decode(context, uri) ?: return null
        var quality = 80
        var bytes: ByteArray
        do {
            val out = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.JPEG, quality, out)
            bytes = out.toByteArray()
            quality -= 10
        } while (bytes.size > MAX_BYTES && quality >= 30)
        if (bytes.size > MAX_BYTES) return null
        return Base64.encodeToString(bytes, Base64.NO_WRAP)
    }

    private fun decode(context: Context, uri: Uri): Bitmap? = runCatching {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            // ImageDecoder aplica solo la rotación de la cámara (EXIF): sin esto las fotos tomadas de
            // costado le llegarían al padre acostadas.
            ImageDecoder.decodeBitmap(ImageDecoder.createSource(context.contentResolver, uri)) { decoder, info, _ ->
                val w = info.size.width
                val h = info.size.height
                val scale = minOf(1f, MAX_SIDE / maxOf(w, h).toFloat())
                decoder.setTargetSize((w * scale).toInt().coerceAtLeast(1), (h * scale).toInt().coerceAtLeast(1))
                decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
            }
        } else {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
            var sample = 1
            while (maxOf(bounds.outWidth, bounds.outHeight) / sample > MAX_SIDE * 2) sample *= 2
            context.contentResolver.openInputStream(uri)?.use {
                BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
            }
        }
    }.getOrNull()
}
