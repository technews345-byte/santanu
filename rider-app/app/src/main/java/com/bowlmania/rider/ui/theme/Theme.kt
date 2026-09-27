package com.bowlmania.rider.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val Forest = Color(0xFF0B5D3B)
private val Lime = Color(0xFFA7D266)
private val Sun = Color(0xFFF5B21B)

private val Light = lightColorScheme(
    primary = Forest, onPrimary = Color.White, primaryContainer = Color(0xFFD4EDCB), onPrimaryContainer = Color(0xFF052E1C),
    secondary = Color(0xFF3F6B2A), onSecondary = Color.White, secondaryContainer = Color(0xFFE5F3D2), onSecondaryContainer = Color(0xFF14290A),
    tertiary = Color(0xFF7A5200), tertiaryContainer = Color(0xFFFFE8B8), onTertiaryContainer = Color(0xFF2A1B00),
    background = Color(0xFFFBF8EF), onBackground = Color(0xFF18231D), surface = Color(0xFFFFFFFF), onSurface = Color(0xFF18231D),
    surfaceVariant = Color(0xFFF1EEE2), onSurfaceVariant = Color(0xFF4B584F), surfaceContainer = Color(0xFFF6F3E8),
    surfaceContainerHigh = Color(0xFFEFECE0), surfaceContainerLow = Color(0xFFFFFFFF), outline = Color(0xFF7A867E), outlineVariant = Color(0xFFDCD8CA),
    error = Color(0xFFB3261E), errorContainer = Color(0xFFF9DEDC), onErrorContainer = Color(0xFF410E0B),
)
private val Dark = darkColorScheme(
    primary = Color(0xFF8FD4A3), onPrimary = Color(0xFF003920), primaryContainer = Color(0xFF0E5A38), onPrimaryContainer = Color(0xFFCDEFD6),
    secondary = Lime, onSecondary = Color(0xFF1C3300), secondaryContainer = Color(0xFF2E4A17), onSecondaryContainer = Color(0xFFE0F2C8),
    tertiary = Sun, tertiaryContainer = Color(0xFF5A3F00), onTertiaryContainer = Color(0xFFFFE8B8),
    background = Color(0xFF0F1A14), onBackground = Color(0xFFE2E8E3), surface = Color(0xFF16231B), onSurface = Color(0xFFE2E8E3),
    surfaceVariant = Color(0xFF26352C), onSurfaceVariant = Color(0xFFBCC8BF), surfaceContainer = Color(0xFF1B2A21),
    surfaceContainerHigh = Color(0xFF223328), surfaceContainerLow = Color(0xFF16231B), outline = Color(0xFF86938A), outlineVariant = Color(0xFF3A4A40),
    error = Color(0xFFF2B8B5), errorContainer = Color(0xFF8C1D18), onErrorContainer = Color(0xFFF9DEDC),
)

/** Operational status colours, tuned for both themes. */
@Immutable data class StatusColors(val online: Color, val offline: Color, val warning: Color, val danger: Color, val info: Color, val onStatus: Color)
val LocalStatus = staticCompositionLocalOf { StatusColors(Color(0xFF1F8A4C), Color(0xFF7D8580), Color(0xFFB7791F), Color(0xFFC0392B), Color(0xFF1F5F99), Color.White) }

private val AppTypography = Typography().let { t ->
    t.copy(
        headlineMedium = t.headlineMedium.copy(fontWeight = FontWeight.Bold, letterSpacing = (-0.3).sp),
        headlineSmall = t.headlineSmall.copy(fontWeight = FontWeight.Bold),
        titleLarge = t.titleLarge.copy(fontWeight = FontWeight.SemiBold),
        titleMedium = t.titleMedium.copy(fontWeight = FontWeight.SemiBold),
        labelLarge = t.labelLarge.copy(fontWeight = FontWeight.SemiBold, fontSize = 15.sp),
    )
}
val Numeric = TextStyle(fontWeight = FontWeight.Bold, fontSize = 28.sp, letterSpacing = (-0.5).sp)

@Composable
fun RiderTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    val status = if (dark) StatusColors(Color(0xFF6FD39A), Color(0xFF9AA39D), Color(0xFFF1B955), Color(0xFFF28B82), Color(0xFF8AB8F0), Color(0xFF0F1A14))
    else StatusColors(Color(0xFF1F8A4C), Color(0xFF7D8580), Color(0xFFB7791F), Color(0xFFC0392B), Color(0xFF1F5F99), Color.White)
    androidx.compose.runtime.CompositionLocalProvider(LocalStatus provides status) {
        MaterialTheme(
            colorScheme = if (dark) Dark else Light,
            typography = AppTypography,
            shapes = Shapes(small = RoundedCornerShape(10.dp), medium = RoundedCornerShape(16.dp), large = RoundedCornerShape(22.dp)),
            content = content,
        )
    }
}
