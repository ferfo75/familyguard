package com.familyguard.child.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// Misma identidad "Nido" que la app del padre (terracota, musgo y miel sobre crema,
// títulos en serif) para que se sienta un solo producto.
private val Terracotta = Color(0xFFC2562B)
private val TerracottaSoft = Color(0xFFF6D9CB)
private val Moss = Color(0xFF3D7A4A)
private val MossSoft = Color(0xFFD7EBD9)
private val Honey = Color(0xFFB8791A)
private val HoneySoft = Color(0xFFFBE6BF)
private val BrickRed = Color(0xFFB3261E)
private val BrickRedSoft = Color(0xFFF9DEDC)
private val Cocoa = Color(0xFF33261C)
private val Cream = Color(0xFFF7F1E8)

private val LightColors = lightColorScheme(
    primary = Terracotta, onPrimary = Color.White,
    primaryContainer = TerracottaSoft, onPrimaryContainer = Color(0xFF5A2410),
    secondary = Moss, onSecondary = Color.White,
    secondaryContainer = MossSoft, onSecondaryContainer = Color(0xFF14341D),
    tertiary = Honey, onTertiary = Color.White,
    tertiaryContainer = HoneySoft, onTertiaryContainer = Color(0xFF4A3000),
    error = BrickRed, onError = Color.White,
    errorContainer = BrickRedSoft, onErrorContainer = Color(0xFF410E0B),
    background = Cream, onBackground = Cocoa,
    surface = Color(0xFFFFFDF9), onSurface = Cocoa,
    surfaceVariant = Color(0xFFEFE4D2), onSurfaceVariant = Color(0xFF7A6A5C),
    outline = Color(0xFFC9B8A3), outlineVariant = Color(0xFFE3D6C5),
    surfaceContainerLowest = Color(0xFFFFFFFF), surfaceContainerLow = Color(0xFFFBF5EA),
    surfaceContainer = Color(0xFFF3EBDF), surfaceContainerHigh = Color(0xFFEDE3D4), surfaceContainerHighest = Color(0xFFE7DBC9),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFF08A5D), onPrimary = Color(0xFF2A1408),
    primaryContainer = Color(0xFF7A2F12), onPrimaryContainer = Color(0xFFFBE0D2),
    secondary = Color(0xFF8FD19B), onSecondary = Color(0xFF0F2A16),
    secondaryContainer = Color(0xFF24502F), onSecondaryContainer = MossSoft,
    tertiary = Color(0xFFF0B04A), onTertiary = Color(0xFF3A2600),
    tertiaryContainer = Color(0xFF5C3E00), onTertiaryContainer = HoneySoft,
    error = Color(0xFFFF8A80), onError = Color(0xFF410E0B),
    errorContainer = Color(0xFF8C1D18), onErrorContainer = BrickRedSoft,
    background = Color(0xFF1E1814), onBackground = Color(0xFFF4EBE0),
    surface = Color(0xFF2A221C), onSurface = Color(0xFFF4EBE0),
    surfaceVariant = Color(0xFF43372D), onSurfaceVariant = Color(0xFFB9A893),
    outline = Color(0xFF7A6A5C), outlineVariant = Color(0xFF43372D),
    surfaceContainerLowest = Color(0xFF17110D), surfaceContainerLow = Color(0xFF241D18),
    surfaceContainer = Color(0xFF2D251F), surfaceContainerHigh = Color(0xFF372E27), surfaceContainerHighest = Color(0xFF41372F),
)

private val Serif = FontFamily.Serif

private val FamilyGuardTypography = Typography(
    headlineMedium = TextStyle(fontFamily = Serif, fontWeight = FontWeight.Bold, fontSize = 28.sp, lineHeight = 34.sp),
    headlineSmall = TextStyle(fontFamily = Serif, fontWeight = FontWeight.Bold, fontSize = 22.sp, lineHeight = 28.sp),
    titleLarge = TextStyle(fontFamily = Serif, fontWeight = FontWeight.SemiBold, fontSize = 20.sp, lineHeight = 26.sp),
    titleMedium = TextStyle(fontFamily = Serif, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, lineHeight = 22.sp),
    bodyLarge = TextStyle(fontWeight = FontWeight.Normal, fontSize = 16.sp, lineHeight = 22.sp),
    bodyMedium = TextStyle(fontWeight = FontWeight.Normal, fontSize = 14.sp, lineHeight = 20.sp),
    bodySmall = TextStyle(fontWeight = FontWeight.Normal, fontSize = 12.sp, lineHeight = 16.sp),
    labelLarge = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 18.sp),
)

private val FamilyGuardShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(18.dp),
    large = RoundedCornerShape(24.dp),
    extraLarge = RoundedCornerShape(28.dp),
)

@Composable
fun FamilyGuardChildTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colorScheme = if (darkTheme) DarkColors else LightColors
    // Barra de estado del color del fondo y con íconos oscuros sobre fondo claro: antes la hora
    // salía blanca sobre crema y no se leía.
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = colorScheme.background.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
        }
    }
    MaterialTheme(
        colorScheme = colorScheme,
        typography = FamilyGuardTypography,
        shapes = FamilyGuardShapes,
        content = content,
    )
}
