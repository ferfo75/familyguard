package com.familyguard.child.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

// Misma identidad visual que la app del padre, para que se sienta un solo
// producto: azul-verdoso "guardián" como color de marca.
private val GuardianBlue = Color(0xFF1B6E7E)
private val GuardianBlueDark = Color(0xFF0F4652)
private val GuardianBlueContainer = Color(0xFFB6E8ED)
private val Ink = Color(0xFF14212B)
private val Mist = Color(0xFFF4F8F9)

private val LightColors = lightColorScheme(
    primary = GuardianBlue,
    onPrimary = Color.White,
    primaryContainer = GuardianBlueContainer,
    onPrimaryContainer = GuardianBlueDark,
    background = Mist,
    onBackground = Ink,
    surface = Color.White,
    onSurface = Ink,
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFF7FD3DE),
    onPrimary = GuardianBlueDark,
    primaryContainer = GuardianBlueDark,
    onPrimaryContainer = GuardianBlueContainer,
    background = Color(0xFF0E1A20),
    onBackground = Color(0xFFDDE4E6),
    surface = Color(0xFF14232A),
    onSurface = Color(0xFFDDE4E6),
)

private val FamilyGuardTypography = Typography(
    headlineMedium = TextStyle(fontWeight = FontWeight.Bold, fontSize = 28.sp, lineHeight = 34.sp),
    titleLarge = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 20.sp, lineHeight = 26.sp),
    bodyLarge = TextStyle(fontWeight = FontWeight.Normal, fontSize = 16.sp, lineHeight = 22.sp),
)

@Composable
fun FamilyGuardChildTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = FamilyGuardTypography,
        content = content,
    )
}
