package com.prabhat.app.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Alarm
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.prabhat.app.data.AppState
import com.prabhat.app.data.Mantra
import com.prabhat.app.data.Store
import com.prabhat.app.domain.ScheduleMath
import com.prabhat.app.playback.PlaybackHub
import com.prabhat.app.playback.PlayerConnection
import com.prabhat.app.playback.SessionKind
import com.prabhat.app.ui.components.GlassCard
import com.prabhat.app.ui.components.MantraArt
import com.prabhat.app.ui.components.SunriseBackground
import com.prabhat.app.ui.screens.HomeScreen
import com.prabhat.app.ui.screens.LibraryScreen
import com.prabhat.app.ui.screens.MantraScreen
import com.prabhat.app.ui.screens.OnboardingScreen
import com.prabhat.app.ui.screens.ScheduleScreen
import com.prabhat.app.ui.screens.SettingsScreen
import com.prabhat.app.ui.theme.LocalPalette
import com.prabhat.app.ui.theme.PrabhatTheme
import kotlinx.coroutines.flow.StateFlow
import java.time.ZonedDateTime

/** The mantra the morning session will play: the next schedule's choice, or the default. */
fun morningMantra(s: AppState, now: ZonedDateTime = ZonedDateTime.now()): Mantra? =
    s.mantraFor(ScheduleMath.next(s.schedules, now)?.rule ?: s.schedules.firstOrNull())

object Routes {
    const val HOME = "home"
    const val LIBRARY = "library"
    const val SCHEDULE = "schedule"
    const val SETTINGS = "settings"
    const val MANTRA = "mantra/{id}"
    fun mantra(id: String) = "mantra/$id"
}

fun NavHostController.tab(route: String) = navigate(route) {
    popUpTo(graph.findStartDestination().id) { saveState = true }
    launchSingleTop = true
    restoreState = true
}

@Composable
fun AppRoot(player: PlayerConnection, playNow: StateFlow<Boolean>, onPlayNowHandled: () -> Unit) {
    val state by Store.state.collectAsStateWithLifecycle()
    val wantsPlay by playNow.collectAsStateWithLifecycle()

    LaunchedEffect(wantsPlay, state.onboarded) {
        if (wantsPlay && state.onboarded) {
            player.send(PlaybackHub.Command.Start(morningMantra(state)?.id, SessionKind.MORNING, resume = false, fade = true))
            onPlayNowHandled()
        }
    }

    PrabhatTheme(state.theme) {
        SunriseBackground {
            if (!state.onboarded) OnboardingScreen(state, player) else Shell(state, player)
        }
    }
}

@Composable
private fun Shell(state: AppState, player: PlayerConnection) {
    val nav = rememberNavController()
    val entry by nav.currentBackStackEntryAsState()
    val route = entry?.destination?.route
    val snack = remember { SnackbarHostState() }
    val error by PlaybackHub.error.collectAsStateWithLifecycle()
    LaunchedEffect(error) {
        error?.let { snack.showSnackbar(it); PlaybackHub.error.value = null }
    }
    val p = LocalPalette.current

    Scaffold(
        containerColor = Color.Transparent,
        contentColor = p.text,
        snackbarHost = { SnackbarHost(snack) },
        bottomBar = {
            Column {
                AnimatedVisibility(
                    visible = route != Routes.HOME,
                    enter = slideInVertically { it } + fadeIn(), exit = slideOutVertically { it } + fadeOut(),
                ) { MiniPlayer(state, player) { nav.tab(Routes.HOME) } }
                NavigationBar(containerColor = if (p.dark) Color(0xEE0B1029) else Color(0xF2FFFAF3), tonalElevation = 0.dp) {
                    val colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = p.gold, selectedTextColor = p.gold, indicatorColor = p.gold.copy(alpha = 0.14f),
                        unselectedIconColor = p.muted, unselectedTextColor = p.muted,
                    )
                    NavigationBarItem(route == Routes.HOME, { nav.tab(Routes.HOME) }, { Icon(Icons.Rounded.Home, null) }, label = { Text("Home") }, colors = colors)
                    NavigationBarItem(
                        route == Routes.LIBRARY || route == Routes.MANTRA, { nav.tab(Routes.LIBRARY) },
                        { Text("ॐ", fontSize = 22.sp, fontWeight = FontWeight.Bold) }, label = { Text("Mantras") }, colors = colors,
                    )
                    NavigationBarItem(route?.startsWith(Routes.SCHEDULE) == true, { nav.tab(Routes.SCHEDULE) }, { Icon(Icons.Rounded.Alarm, null) }, label = { Text("Schedule") }, colors = colors)
                    NavigationBarItem(route == Routes.SETTINGS, { nav.tab(Routes.SETTINGS) }, { Icon(Icons.Rounded.Settings, null) }, label = { Text("Settings") }, colors = colors)
                }
            }
        },
    ) { pad ->
        NavHost(
            nav, startDestination = Routes.HOME, modifier = Modifier.fillMaxSize(),
            enterTransition = { fadeIn(tween(260)) + slideInVertically(tween(320)) { it / 30 } },
            exitTransition = { fadeOut(tween(180)) },
            popEnterTransition = { fadeIn(tween(260)) },
            popExitTransition = { fadeOut(tween(180)) + slideOutVertically(tween(220)) { it / 30 } },
        ) {
            composable(Routes.HOME) { HomeScreen(state, player, pad, nav) }
            composable(Routes.LIBRARY) { LibraryScreen(state, player, pad, nav) }
            composable(
                Routes.SCHEDULE + "?mantra={mantra}",
                arguments = listOf(navArgument("mantra") { type = NavType.StringType; nullable = true; defaultValue = null }),
            ) { ScheduleScreen(state, pad, it.arguments?.getString("mantra")) }
            composable(Routes.SETTINGS) { SettingsScreen(state, pad, nav) }
            composable(Routes.MANTRA, arguments = listOf(navArgument("id") { type = NavType.StringType })) {
                MantraScreen(state, player, pad, nav, it.arguments?.getString("id").orEmpty())
            }
        }
    }
}

/** Compact player above the navigation bar on every tab except Home. */
@Composable
private fun MiniPlayer(state: AppState, player: PlayerConnection, onOpen: () -> Unit) {
    val ui by player.ui.collectAsStateWithLifecycle()
    if (!ui.loaded) return
    val mantra = state.mantra(ui.mantraId)
    GlassCard(
        Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp),
        onClick = onOpen, padding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(44.dp), contentAlignment = Alignment.Center) { MantraArt(mantra, 36.dp, ui.isPlaying, glow = false) }
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(mantra?.name ?: "Mantra", style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(if (ui.isPlaying) "Playing" else "Paused", style = MaterialTheme.typography.bodySmall, color = LocalPalette.current.muted)
            }
            IconButton(onClick = { if (ui.isPlaying) player.pause() else player.play() }) {
                Icon(if (ui.isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, if (ui.isPlaying) "Pause" else "Play", tint = LocalPalette.current.gold)
            }
        }
    }
}
