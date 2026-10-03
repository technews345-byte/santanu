@file:OptIn(ExperimentalLayoutApi::class)

package com.prabhat.app.ui.components

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import coil.compose.AsyncImage
import com.prabhat.app.R
import com.prabhat.app.data.Library
import com.prabhat.app.data.Mantra
import com.prabhat.app.ui.theme.Eyebrow
import com.prabhat.app.ui.theme.LocalPalette
import kotlinx.coroutines.delay
import java.io.File
import java.time.ZonedDateTime
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin
import kotlin.random.Random

/** Soft sunrise gradient with a faint glow from above and slowly drifting motes of light. */
@Composable
fun SunriseBackground(modifier: Modifier = Modifier, content: @Composable BoxScope.() -> Unit) {
    val p = LocalPalette.current
    val drift = rememberInfiniteTransition(label = "drift")
    val t by drift.animateFloat(0f, 1f, infiniteRepeatable(tween(90_000, easing = LinearEasing)), label = "t")
    val motes = remember { List(26) { Triple(Random.nextFloat(), Random.nextFloat(), 0.4f + Random.nextFloat()) } }
    Box(
        modifier
            .fillMaxSize()
            .background(Brush.verticalGradient(listOf(p.skyTop, p.skyMid, p.skyBottom, p.skyBottom)))
    ) {
        Canvas(Modifier.fillMaxSize()) {
            val top = Offset(size.width / 2, -size.height * 0.05f)
            drawCircle(
                Brush.radialGradient(listOf(p.glow.copy(alpha = if (p.dark) 0.16f else 0.28f), Color.Transparent), top, size.width * 0.95f),
                radius = size.width * 0.95f, center = top,
            )
            // Light rays fanning down from the glow.
            for (i in 0 until 7) {
                val a = PI / 2 + (i - 3) * 0.2 + sin(t * 2 * PI + i) * 0.015
                val len = size.height * 0.75f
                drawLine(
                    Brush.linearGradient(
                        listOf(p.glow.copy(alpha = if (p.dark) 0.05f else 0.08f), Color.Transparent),
                        top, Offset(top.x + (cos(a) * len).toFloat(), top.y + (sin(a) * len).toFloat()),
                    ),
                    start = top, end = Offset(top.x + (cos(a) * len).toFloat(), top.y + (sin(a) * len).toFloat()),
                    strokeWidth = size.width * 0.06f,
                )
            }
            motes.forEachIndexed { i, (x, y, speed) ->
                val yy = ((y - t * speed * 1.5f) % 1f + 1f) % 1f
                val twinkle = 0.5f + 0.5f * sin((t * 40 * speed + i) * PI).toFloat()
                drawCircle(
                    p.particle.copy(alpha = (if (p.dark) 0.35f else 0.45f) * twinkle * (0.3f + yy * 0.7f)),
                    radius = (1.2f + speed * 1.6f) * density,
                    center = Offset(x * size.width + sin((t * 6 + i) * PI).toFloat() * 8 * density, yy * size.height),
                )
            }
        }
        content()
    }
}

@Composable
fun GlassCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    padding: PaddingValues = PaddingValues(20.dp),
    content: @Composable ColumnScope.() -> Unit,
) {
    val p = LocalPalette.current
    val shape = RoundedCornerShape(28.dp)
    // Frosted glass without an elevation shadow: a shadow under a translucent card shows through as a grey box.
    CompositionLocalProvider(LocalContentColor provides p.text) {
        Column(
            modifier
                .clip(shape)
                .background(Brush.verticalGradient(listOf(p.glass, p.glassLow)))
                .border(1.dp, p.glassBorder, shape)
                .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
                .padding(padding),
            content = content,
        )
    }
}

/** Mantra artwork, always the whole picture (never cropped), with a golden glow that breathes while it plays. */
@Composable
fun MantraArt(mantra: Mantra?, size: Dp, playing: Boolean = false, glow: Boolean = true) {
    val p = LocalPalette.current
    val breath = rememberInfiniteTransition(label = "breath")
    val pulse by breath.animateFloat(
        0f, 1f, infiniteRepeatable(tween(4200, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "pulse",
    )
    val amount by animateFloatAsState(if (playing) 1f else 0f, tween(1200), label = "amount")
    val scale = 1f + 0.035f * pulse * amount
    Box(Modifier.size(size * 1.4f), contentAlignment = Alignment.Center) {
        if (glow) {
            Canvas(Modifier.fillMaxSize().scale(1f + 0.08f * pulse * amount)) {
                drawCircle(
                    Brush.radialGradient(
                        listOf(p.glow.copy(alpha = 0.45f + 0.2f * amount), p.glow.copy(alpha = 0.12f), Color.Transparent),
                        center, this.size.minDimension / 2,
                    )
                )
            }
        }
        val shape = RoundedCornerShape(size * 0.16f)
        val art = Modifier
            .size(size)
            .scale(scale)
            .clip(shape)
            .background(p.glass)
            .border(1.5.dp, p.gold.copy(alpha = 0.5f), shape)
        val cover = mantra?.cover?.let(::File)?.takeIf { it.exists() }
        if (cover != null) {
            AsyncImage(model = cover, contentDescription = null, contentScale = ContentScale.Fit, modifier = art)
        } else {
            Image(painterResource(Library.artRes(mantra)), contentDescription = null, contentScale = ContentScale.Fit, modifier = art)
        }
    }
}

@Composable
fun BigPlayButton(playing: Boolean, size: Dp = 76.dp, onClick: () -> Unit) {
    val p = LocalPalette.current
    Surface(
        onClick = onClick,
        shape = CircleShape,
        color = Color.Transparent,
        shadowElevation = 6.dp,
        modifier = Modifier.size(size),
    ) {
        Box(
            Modifier.fillMaxSize().background(Brush.linearGradient(listOf(p.glow, p.gold))),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                if (playing) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                contentDescription = if (playing) "Pause" else "Play",
                tint = Color.White,
                modifier = Modifier.size(size * 0.48f),
            )
        }
    }
}

@Composable
fun Eyebrow(text: String, modifier: Modifier = Modifier) {
    Text(text.uppercase(), style = Eyebrow, color = LocalPalette.current.gold, modifier = modifier)
}

@Composable
fun <T> OptionChips(options: List<T>, selected: T?, label: (T) -> String, onSelect: (T) -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        options.forEach { o ->
            FilterChip(
                selected = o == selected,
                onClick = { onSelect(o) },
                label = { Text(label(o), modifier = Modifier.padding(vertical = 8.dp)) },
                shape = RoundedCornerShape(50),
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = LocalPalette.current.gold.copy(alpha = 0.18f),
                    selectedLabelColor = MaterialTheme.colorScheme.onSurface,
                ),
            )
        }
    }
}

@Composable
fun ToggleRow(title: String, subtitle: String? = null, checked: Boolean, enabled: Boolean = true, onChange: (Boolean) -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(enabled = enabled, role = Role.Switch) { onChange(!checked) }
            .padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            subtitle?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = LocalPalette.current.muted) }
        }
        Spacer(Modifier.width(12.dp))
        Switch(
            checked = checked, onCheckedChange = onChange, enabled = enabled,
            colors = SwitchDefaults.colors(checkedTrackColor = LocalPalette.current.gold),
        )
    }
}

@Composable
fun ActionRow(icon: ImageVector?, title: String, subtitle: String? = null, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).clickable(onClick = onClick).padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        icon?.let {
            Icon(it, null, tint = LocalPalette.current.gold, modifier = Modifier.size(22.dp))
            Spacer(Modifier.width(14.dp))
        }
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
            subtitle?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = LocalPalette.current.muted) }
        }
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = LocalPalette.current.muted)
    }
}

/** The current time, refreshed every [periodMs]. */
@Composable
fun rememberNow(periodMs: Long = 15_000): State<ZonedDateTime> {
    val now = remember { mutableStateOf(ZonedDateTime.now()) }
    LaunchedEffect(periodMs) {
        while (true) {
            now.value = ZonedDateTime.now()
            delay(periodMs - System.currentTimeMillis() % periodMs)
        }
    }
    return now
}

/** Increments every time the screen resumes, to re-check permissions the user may have changed in Settings. */
@Composable
fun rememberResumeTick(): Int {
    val owner = LocalLifecycleOwner.current
    val tick = remember { mutableIntStateOf(0) }
    val current by rememberUpdatedState(owner)
    DisposableEffect(current) {
        val obs = LifecycleEventObserver { _, e -> if (e == Lifecycle.Event.ON_RESUME) tick.intValue++ }
        current.lifecycle.addObserver(obs)
        onDispose { current.lifecycle.removeObserver(obs) }
    }
    return tick.intValue
}
