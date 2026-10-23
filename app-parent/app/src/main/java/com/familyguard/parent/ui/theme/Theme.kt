package com.familyguard.parent.ui.theme

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat

// Paleta propia de FamilyGuard: un azul-verdoso "guardián" como color de
// marca (transmite seguridad/confianza, no es un azul genérico de Material),
// con un ámbar cálido para acciones destacadas y un rojo reservado
// exclusivamente para SOS/alertas, para que ese color siga significando
// "urgente" en toda la app.
val GuardianBlue = Color(0xFF1B6E7E)
val GuardianBlueDark = Color(0xFF0F4652)
val GuardianBlueContainer = Color(0xFFB6E8ED)
val Amber = Color(0xFFF2A541)
val AmberContainer = Color(0xFFFFE3B3)
val AlertRed = Color(0xFFD64550)
val AlertRedContainer = Color(0xFFFFDAD9)
val Ink = Color(0xFF14212B)
val Mist = Color(0xFFF4F8F9)

private val LightColors = lightColorScheme(
    primary = GuardianBlue,
    onPrimary = Color.White,
    primaryContainer = GuardianBlueContainer,
    onPrimaryContainer = GuardianBlueDark,
    secondary = Amber,
    onSecondary = Color.White,
    secondaryContainer = AmberContainer,
    onSecondaryContainer = Color(0xFF5C3B00),
    tertiary = AlertRed,
    onTertiary = Color.White,
    tertiaryContainer = AlertRedContainer,
    onTertiaryContainer = Color(0xFF5C0E14),
    error = AlertRed,
    background = Mist,
    onBackground = Ink,
    surface = Color.White,
    onSurface = Ink,
    surfaceVariant = Color(0xFFE3EDEE),
    onSurfaceVariant = Color(0xFF445255),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFF7FD3DE),
    onPrimary = GuardianBlueDark,
    primaryContainer = GuardianBlueDark,
    onPrimaryContainer = GuardianBlueContainer,
    secondary = Amber,
    onSecondary = Color(0xFF3F2700),
    secondaryContainer = Color(0xFF5C3B00),
    onSecondaryContainer = AmberContainer,
    tertiary = Color(0xFFFFB3AE),
    onTertiary = Color(0xFF5C0E14),
    tertiaryContainer = Color(0xFF7D1D22),
    onTertiaryContainer = AlertRedContainer,
    error = Color(0xFFFFB3AE),
    background = Color(0xFF0E1A20),
    onBackground = Color(0xFFDDE4E6),
    surface = Color(0xFF14232A),
    onSurface = Color(0xFFDDE4E6),
    surfaceVariant = Color(0xFF26373D),
    onSurfaceVariant = Color(0xFFB9C7CA),
)

private val FamilyGuardTypography = Typography(
    headlineMedium = TextStyle(fontWeight = FontWeight.Bold, fontSize = 28.sp, lineHeight = 34.sp),
    headlineSmall = TextStyle(fontWeight = FontWeight.Bold, fontSize = 22.sp, lineHeight = 28.sp),
    titleLarge = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 20.sp, lineHeight = 26.sp),
    titleMedium = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 16.sp, lineHeight = 22.sp),
    bodyLarge = TextStyle(fontWeight = FontWeight.Normal, fontSize = 16.sp, lineHeight = 22.sp),
    bodyMedium = TextStyle(fontWeight = FontWeight.Normal, fontSize = 14.sp, lineHeight = 20.sp),
    labelLarge = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 18.sp),
)

@Composable
fun FamilyGuardParentTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colorScheme = if (darkTheme) DarkColors else LightColors

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = colorScheme.primary.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = FamilyGuardTypography,
        content = content,
    )
}
