package com.prabhat.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.prabhat.app.data.ThemeMode

/** Colours beyond Material's scheme: the sunrise background, frosted glass and the golden glow. */
@Immutable
data class Palette(
    val dark: Boolean,
    val skyTop: Color,
    val skyMid: Color,
    val skyBottom: Color,
    val glass: Color,
    /** Bottom of the glass gradient. */
    val glassLow: Color,
    val glassBorder: Color,
    val gold: Color,
    val glow: Color,
    val text: Color,
    val muted: Color,
    val particle: Color,
)

private val LightPalette = Palette(
    dark = false,
    skyTop = Color(0xFFFCE3CB),
    skyMid = Color(0xFFFBEFE2),
    skyBottom = Color(0xFFFBF6EE),
    glass = Color(0xCCFFFFFF),
    glassLow = Color(0x99FFFDF9),
    glassBorder = Color(0xE6FFFFFF),
    gold = Color(0xFFB8862E),
    glow = Color(0xFFF2B55E),
    text = Color(0xFF2B2230),
    muted = Color(0xFF7D7075),
    particle = Color(0xFFE9B872),
)

private val DarkPalette = Palette(
    dark = true,
    skyTop = Color(0xFF1B2350),
    skyMid = Color(0xFF0F1533),
    skyBottom = Color(0xFF080C1F),
    glass = Color(0x1AFFFFFF),
    glassLow = Color(0x0DFFFFFF),
    glassBorder = Color(0x26FFFFFF),
    gold = Color(0xFFE8C27A),
    glow = Color(0xFFE8B566),
    text = Color(0xFFF6F1E7),
    muted = Color(0xFFA9AAC2),
    particle = Color(0xFFF3D9A4),
)

val LocalPalette = staticCompositionLocalOf { LightPalette }

private val Serif = FontFamily.Serif

private val AppTypography = Typography().let { t ->
    t.copy(
        displaySmall = t.displaySmall.copy(fontFamily = Serif, fontWeight = FontWeight.Medium),
        headlineLarge = t.headlineLarge.copy(fontFamily = Serif, fontWeight = FontWeight.Medium),
        headlineMedium = t.headlineMedium.copy(fontFamily = Serif, fontWeight = FontWeight.Medium),
        headlineSmall = t.headlineSmall.copy(fontFamily = Serif, fontWeight = FontWeight.Medium),
        titleLarge = t.titleLarge.copy(fontFamily = Serif, fontWeight = FontWeight.Medium),
        titleMedium = t.titleMedium.copy(fontWeight = FontWeight.SemiBold),
        labelLarge = t.labelLarge.copy(fontWeight = FontWeight.SemiBold, letterSpacing = 0.3.sp),
    )
}

val Eyebrow = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 1.6.sp)

@Composable
fun PrabhatTheme(mode: ThemeMode, content: @Composable () -> Unit) {
    val dark = when (mode) {
        ThemeMode.SYSTEM -> isSystemInDarkTheme()
        ThemeMode.LIGHT -> false
        ThemeMode.DARK -> true
    }
    val p = if (dark) DarkPalette else LightPalette
    val scheme = if (dark) {
        darkColorScheme(
            primary = p.gold, onPrimary = Color(0xFF241A06),
            secondary = Color(0xFFB7B9E6), onSecondary = Color(0xFF151A3C),
            background = p.skyBottom, onBackground = p.text,
            surface = Color(0xFF12183A), onSurface = p.text,
            surfaceVariant = Color(0xFF1C2350), onSurfaceVariant = p.muted,
            surfaceContainerHigh = Color(0xFF161D44), surfaceContainer = Color(0xFF12183A),
            outline = Color(0x33FFFFFF), outlineVariant = Color(0x1FFFFFFF),
            error = Color(0xFFFFB4A8),
        )
    } else {
        lightColorScheme(
            primary = p.gold, onPrimary = Color.White,
            secondary = Color(0xFF8C6D5B), onSecondary = Color.White,
            background = p.skyBottom, onBackground = p.text,
            surface = Color(0xFFFFFBF5), onSurface = p.text,
            surfaceVariant = Color(0xFFF4E9DC), onSurfaceVariant = p.muted,
            surfaceContainerHigh = Color(0xFFFBF1E6), surfaceContainer = Color(0xFFFFF8F0),
            outline = Color(0x332B2230), outlineVariant = Color(0x1A2B2230),
            error = Color(0xFFB3261E),
        )
    }
    CompositionLocalProvider(LocalPalette provides p) {
        MaterialTheme(colorScheme = scheme, typography = AppTypography) {
            // Text without an explicit colour follows the theme (otherwise it defaults to black, invisible in dark mode).
            CompositionLocalProvider(LocalContentColor provides p.text, content = content)
        }
    }
}
