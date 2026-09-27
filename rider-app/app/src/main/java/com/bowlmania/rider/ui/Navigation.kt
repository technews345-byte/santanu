package com.bowlmania.rider.ui

import android.net.Uri
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ReceiptLong
import androidx.compose.material.icons.automirrored.outlined.ReceiptLong
import androidx.compose.material.icons.filled.EventAvailable
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.bowlmania.rider.data.Prefs
import com.bowlmania.rider.data.net.SessionEvents
import com.bowlmania.rider.location.TrackingService
import com.bowlmania.rider.notify.Notifier
import com.bowlmania.rider.notify.Push
import com.bowlmania.rider.ui.components.OfflineBanner
import com.bowlmania.rider.ui.screens.*
import com.bowlmania.rider.ui.theme.RiderTheme
import com.bowlmania.rider.work.Workers
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/** The five main tabs, exactly as specified for the rider app. */
enum class MainTab(val label: String, val selected: ImageVector, val unselected: ImageVector) {
    Home("Home", Icons.Filled.Home, Icons.Outlined.Home),
    Orders("Orders", Icons.AutoMirrored.Filled.ReceiptLong, Icons.AutoMirrored.Outlined.ReceiptLong),
    Notifications("Notifications", Icons.Filled.Notifications, Icons.Outlined.Notifications),
    Attendance("Attendance", Icons.Filled.EventAvailable, Icons.Outlined.EventAvailable),
    Profile("Profile", Icons.Filled.Person, Icons.Outlined.Person),
}

/** Navigation actions handed to screens. */
class Nav(private val controller: NavHostController, private val selectTab: (MainTab) -> Unit) {
    fun open(route: String) = controller.navigate(route) { launchSingleTop = true }
    fun replace(route: String) { controller.popBackStack(); open(route) }
    fun back() { controller.popBackStack() }
    fun tab(t: MainTab) { controller.popBackStack(MAIN, inclusive = false); selectTab(t) }
}

private const val MAIN = "main"
private const val LOGIN = "login"

@Composable
fun AppRoot(links: StateFlow<Uri?>, consumeLink: () -> Unit) {
    val c = appContainer()
    val theme by c.prefs.theme.collectAsState()
    val dark = when (theme) { Prefs.THEME_DARK -> true; Prefs.THEME_LIGHT -> false; else -> isSystemInDarkTheme() }
    RiderTheme(dark) {
        val controller = rememberNavController()
        var tab by rememberSaveable { mutableStateOf(MainTab.Home) }
        var signedIn by remember { mutableStateOf(c.session.isSignedIn) }
        var notice by remember { mutableStateOf<String?>(null) }
        var unread by remember { mutableIntStateOf(0) }
        val online by c.connectivity.online.collectAsState()
        val link by links.collectAsState()
        val snackbar = remember { SnackbarHostState() }
        val nav = remember(controller) { Nav(controller) { tab = it } }

        LaunchedEffect(Unit) {
            Snack.flow.collect { msg -> snackbar.currentSnackbarData?.dismiss(); launch { snackbar.showSnackbar(msg, withDismissAction = true) } }
        }

        // Any 401 (signed out elsewhere, account disabled, token expired) returns to sign-in.
        LaunchedEffect(Unit) {
            SessionEvents.expired.collect { message ->
                if (!signedIn) return@collect
                TrackingService.stop(c.app)
                Workers.cancelAll(c.app)
                c.repository.clearLocal()
                signedIn = false
                notice = message
                controller.navigate(LOGIN) { popUpTo(controller.graph.id) { inclusive = true } }
            }
        }

        // While signed in and in the foreground: keep push registered, background sync scheduled and tracking in step with the server.
        LaunchedEffect(signedIn) {
            if (!signedIn) return@LaunchedEffect
            Workers.schedulePeriodicSync(c.app)
            Push.register(c.repository)
            c.repository.refreshProfile()
        }
        if (signedIn) RefreshWhileVisible(30_000) {
            c.repository.sync(c.session.lastNotificationId).onSuccess { s ->
                unread = s.unread
                Notifier.showNew(c.app, s.notifications, c.session)
                if (s.tracking) TrackingService.start(c.app, s.activeOrderId)
            }
            c.repository.flushLocations()
        }

        // Deep links from notifications.
        LaunchedEffect(link, signedIn) {
            val uri = link ?: return@LaunchedEffect
            if (!signedIn || uri.scheme != "bowlmaniarider") return@LaunchedEffect
            val id = uri.pathSegments.firstOrNull()?.toIntOrNull()
            when (uri.host) {
                "order" -> if (id != null) nav.open("order/$id")
                "ticket" -> if (id != null) nav.open("ticket/$id")
                "tab" -> MainTab.entries.firstOrNull { it.name.equals(uri.pathSegments.firstOrNull(), ignoreCase = true) }?.let(nav::tab)
            }
            consumeLink()
        }

        Box(Modifier.fillMaxSize()) {
            Surface(color = MaterialTheme.colorScheme.background, modifier = Modifier.fillMaxSize()) {
                NavHost(controller, startDestination = if (signedIn) MAIN else LOGIN) {
                    composable(LOGIN) {
                        LoginScreen(notice = notice, onSignedIn = {
                            notice = null; signedIn = true; tab = MainTab.Home
                            controller.navigate(MAIN) { popUpTo(LOGIN) { inclusive = true } }
                        })
                    }
                    composable(MAIN) {
                        MainScreen(tab, { tab = it }, nav, online, unread, { unread = it }, onSignedOut = {
                            signedIn = false; notice = null
                            controller.navigate(LOGIN) { popUpTo(controller.graph.id) { inclusive = true } }
                        })
                    }
                    composable("order/{id}", listOf(navArgument("id") { type = NavType.IntType })) { OrderDetailScreen(it.arguments!!.getInt("id"), nav) }
                    composable("proof/{id}", listOf(navArgument("id") { type = NavType.IntType })) { ProofScreen(it.arguments!!.getInt("id"), nav) }
                    composable("ticket/{id}", listOf(navArgument("id") { type = NavType.IntType })) { TicketScreen(it.arguments!!.getInt("id"), nav) }
                    composable("support/new?order={order}", listOf(navArgument("order") { type = NavType.StringType; nullable = true; defaultValue = null })) {
                        NewTicketScreen(it.arguments?.getString("order")?.toIntOrNull(), nav)
                    }
                    composable("safety?order={order}", listOf(navArgument("order") { type = NavType.StringType; nullable = true; defaultValue = null })) {
                        SafetyScreen(it.arguments?.getString("order")?.toIntOrNull(), nav)
                    }
                    composable("support") { SupportScreen(nav) }
                    composable("history") { HistoryScreen(nav) }
                    composable("performance") { PerformanceScreen(nav) }
                    composable("settings") { SettingsScreen(nav) }
                    composable("leave") { LeaveScreen(nav) }
                    composable("attendance/history") { AttendanceHistoryScreen(nav) }
                }
            }
            SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = if (signedIn) 80.dp else 16.dp))
        }
    }
}

@Composable
private fun MainScreen(tab: MainTab, onTab: (MainTab) -> Unit, nav: Nav, online: Boolean, unread: Int, onUnread: (Int) -> Unit, onSignedOut: () -> Unit) {
    Scaffold(
        contentWindowInsets = WindowInsets(0),
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = {
            Column {
                OfflineBanner(online)
                NavigationBar {
                    MainTab.entries.forEach { t ->
                        NavigationBarItem(
                            selected = tab == t, onClick = { onTab(t) }, label = { Text(t.label, maxLines = 1) },
                            icon = {
                                if (t == MainTab.Notifications && unread > 0) BadgedBox(badge = { Badge { Text(if (unread > 99) "99+" else unread.toString()) } }) {
                                    Icon(if (tab == t) t.selected else t.unselected, null)
                                } else Icon(if (tab == t) t.selected else t.unselected, null)
                            },
                        )
                    }
                }
            }
        },
    ) { pad ->
        Box(Modifier.padding(pad).consumeWindowInsets(pad).fillMaxSize()) {
            when (tab) {
                MainTab.Home -> HomeScreen(nav, online)
                MainTab.Orders -> OrdersScreen(nav)
                MainTab.Notifications -> NotificationsScreen(nav, onUnread)
                MainTab.Attendance -> AttendanceScreen(nav)
                MainTab.Profile -> ProfileScreen(nav, onSignedOut)
            }
        }
    }
}
