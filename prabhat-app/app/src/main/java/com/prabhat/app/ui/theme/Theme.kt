@file:OptIn(ExperimentalTextApi::class)

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
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.prabhat.app.R
import com.prabhat.app.data.ThemeMode

/** Colours beyond Material's scheme: the sky background, frosted glass and the warm glow. */
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
    /** Accent for text, icons and controls (readable on the background). */
    val gold: Color,
    /** Bright accent for glows, gradients and the mandala. */
    val glow: Color,
    val text: Color,
    val muted: Color,
    val particle: Color,
)

/** Morning: saffron and marigold over warm ivory. */
private val Sunrise = Palette(
    dark = false,
    skyTop = Color(0xFFFFD9A8),
    skyMid = Color(0xFFFFEBD2),
    skyBottom = Color(0xFFFFFDF9),
    glass = Color(0xD9FFFFFF),
    glassLow = Color(0xA6FFFDF9),
    glassBorder = Color(0xF2FFFFFF),
    gold = Color(0xFFB85C00),       // deep saffron: 5:1 contrast on ivory
    glow = Color(0xFFFF9933),       // saffron
    text = Color(0xFF2B1D12),
    muted = Color(0xFF7A6656),
    particle = Color(0xFFFFB74D),   // marigold
)

/** Evening: deep indigo with muted gold. */
private val Twilight = Palette(
    dark = true,
    skyTop = Color(0xFF2C2D4E),
    skyMid = Color(0xFF1F2038),
    skyBottom = Color(0xFF1A1B2F),
    glass = Color(0x1AFFFFFF),
    glassLow = Color(0x0DFFFFFF),
    glassBorder = Color(0x26FFFFFF),
    gold = Color(0xFFD4AF37),
    glow = Color(0xFFD4AF37),
    text = Color(0xFFF3EFE6),
    muted = Color(0xFFA6A8C4),
    particle = Color(0xFFE9D38A),
)

val LocalPalette = staticCompositionLocalOf { Sunrise }

private fun jakarta(weight: Int) =
    Font(R.font.jakarta, FontWeight(weight), variationSettings = FontVariation.Settings(FontVariation.weight(weight)))

/** Plus Jakarta Sans for the interface. */
private val Sans = FontFamily(jakarta(400), jakarta(500), jakarta(600), jakarta(700))

/** Tiro Bangla, a traditional serif, for mantra words and transliteration (other scripts fall back to the system font). */
val LyricFont = FontFamily(Font(R.font.tiro_bangla))

private val AppTypography = Typography().let { t ->
    fun TextStyle.ui(weight: FontWeight? = null) = copy(fontFamily = Sans, fontWeight = weight ?: fontWeight)
    t.copy(
        displaySmall = t.displaySmall.ui(FontWeight.SemiBold),
        headlineLarge = t.headlineLarge.ui(FontWeight.SemiBold),
        headlineMedium = t.headlineMedium.ui(FontWeight.SemiBold),
        headlineSmall = t.headlineSmall.ui(FontWeight.SemiBold),
        titleLarge = t.titleLarge.ui(FontWeight.SemiBold),
        titleMedium = t.titleMedium.ui(FontWeight.SemiBold),
        titleSmall = t.titleSmall.ui(FontWeight.SemiBold),
        bodyLarge = t.bodyLarge.ui(),
        bodyMedium = t.bodyMedium.ui(),
        bodySmall = t.bodySmall.ui(),
        labelLarge = t.labelLarge.ui(FontWeight.SemiBold).copy(letterSpacing = 0.3.sp),
        labelMedium = t.labelMedium.ui(FontWeight.Medium),
        labelSmall = t.labelSmall.ui(FontWeight.Medium),
    )
}

val Eyebrow = TextStyle(fontFamily = Sans, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 1.6.sp)

/** [daytime] drives [ThemeMode.AUTO]: the sunrise palette by day, twilight from sunset. */
@Composable
fun PrabhatTheme(mode: ThemeMode, daytime: Boolean, content: @Composable () -> Unit) {
    val dark = when (mode) {
        ThemeMode.AUTO -> !daytime
        ThemeMode.SYSTEM -> isSystemInDarkTheme()
        ThemeMode.LIGHT -> false
        ThemeMode.DARK -> true
    }
    val p = if (dark) Twilight else Sunrise
    val scheme = if (dark) {
        darkColorScheme(
            primary = p.gold, onPrimary = Color(0xFF1A1B2F),
            secondary = Color(0xFFB9BBE0), onSecondary = Color(0xFF1A1B2F),
            background = p.skyBottom, onBackground = p.text,
            surface = Color(0xFF23243B), onSurface = p.text,
            surfaceVariant = Color(0xFF2C2D4E), onSurfaceVariant = p.muted,
            surfaceContainerHigh = Color(0xFF27283F), surfaceContainer = Color(0xFF23243B), surfaceContainerHighest = Color(0xFF30314F),
            primaryContainer = Color(0xFF4A4126), onPrimaryContainer = p.gold,
            secondaryContainer = Color(0xFF3B3726), onSecondaryContainer = p.gold,
            tertiaryContainer = Color(0xFF3B3726), onTertiaryContainer = p.gold,
            outline = Color(0x33FFFFFF), outlineVariant = Color(0x1FFFFFFF),
            error = Color(0xFFFFB4A8),
        )
    } else {
        lightColorScheme(
            primary = p.gold, onPrimary = Color.White,
            secondary = Color(0xFF8C5A3C), onSecondary = Color.White,
            background = p.skyBottom, onBackground = p.text,
            surface = Color(0xFFFFFDF9), onSurface = p.text,
            surfaceVariant = Color(0xFFFFF0DC), onSurfaceVariant = p.muted,
            surfaceContainerHigh = Color(0xFFFFF4E6), surfaceContainer = Color(0xFFFFF9F0), surfaceContainerHighest = Color(0xFFFCE9D2),
            primaryContainer = Color(0xFFFFE0B8), onPrimaryContainer = p.text,
            secondaryContainer = Color(0xFFFFE6C2), onSecondaryContainer = p.text,
            tertiaryContainer = Color(0xFFFFE6C2), onTertiaryContainer = p.text,
            outline = Color(0x332B1D12), outlineVariant = Color(0x1A2B1D12),
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
