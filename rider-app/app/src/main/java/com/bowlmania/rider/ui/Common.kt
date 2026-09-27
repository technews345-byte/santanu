package com.bowlmania.rider.ui

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.repeatOnLifecycle
import com.bowlmania.rider.AppContainer
import com.bowlmania.rider.RiderApp
import com.bowlmania.rider.data.Loaded
import com.bowlmania.rider.data.Repository
import com.bowlmania.rider.data.net.AppError
import com.bowlmania.rider.data.net.Delivery
import com.bowlmania.rider.location.Locations
import com.bowlmania.rider.location.TrackingService
import com.bowlmania.rider.ui.components.UiState
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Short messages shown in the app-wide snackbar. */
object Snack {
    private val _flow = MutableSharedFlow<String>(extraBufferCapacity = 8)
    val flow: SharedFlow<String> = _flow.asSharedFlow()
    fun show(message: String) { _flow.tryEmit(message) }
}

const val GENERIC_ERROR = "Something went wrong. Please try again."

@Composable
fun appContainer(): AppContainer = (LocalContext.current.applicationContext as RiderApp).container

/**
 * Base for screens that show one server resource. Handles loading, offline cache, errors, busy state
 * and idempotency keys (a retried action reuses its key, so the server never applies it twice).
 */
abstract class LoadVm<T>(val c: AppContainer) : ViewModel() {
    protected val _state = MutableStateFlow(UiState<T>())
    val state: StateFlow<UiState<T>> = _state.asStateFlow()
    private val _busy = MutableStateFlow<String?>(null)
    /** Tag of the action currently running, or null. */
    val busy: StateFlow<String?> = _busy.asStateFlow()
    private var loadJob: Job? = null
    private val keys = HashMap<String, String>()

    protected abstract suspend fun fetch(): Result<Loaded<T>>

    fun load(silent: Boolean = false) {
        if (loadJob?.isActive == true) return
        loadJob = viewModelScope.launch {
            if (!silent) _state.update { it.copy(loading = true, error = null) }
            fetch().fold(
                { l -> _state.value = UiState(l.data, false, null, l.cachedAt) },
                { e ->
                    val hadData = _state.value.data != null
                    _state.update { it.copy(loading = false, error = if (hadData) null else (e.message ?: GENERIC_ERROR)) }
                    if (hadData && !silent && e !is AppError.SessionExpired) Snack.show(e.message ?: GENERIC_ERROR)
                },
            )
        }
    }

    protected fun setData(d: T) { _state.value = UiState(d, false, null, null) }
    protected fun keyFor(action: String): String = keys.getOrPut(action) { Repository.newKey() }
    protected fun forgetKey(action: String) { keys.remove(action) }

    /** Runs one rider action; only one at a time per screen. Network failures keep the key for a safe retry. */
    protected fun <R> act(
        tag: String,
        block: suspend () -> Result<R>,
        onError: (Throwable) -> Unit = { Snack.show(it.message ?: GENERIC_ERROR) },
        onOk: (R) -> Unit,
    ) {
        if (_busy.value != null) return
        viewModelScope.launch {
            _busy.value = tag
            try {
                block().fold({ forgetKey(tag); onOk(it) }, { e ->
                    if (e !is AppError.Offline) forgetKey(tag)
                    if (e !is AppError.SessionExpired) onError(e)
                })
            } finally { _busy.value = null }
        }
    }

    fun accept(orderId: Int, then: (Delivery) -> Unit = {}) = act("accept:$orderId", {
        val loc = Locations.current(c.app, 3_000)
        c.repository.accept(orderId, keyFor("accept:$orderId"), loc?.latitude, loc?.longitude)
    }, onError = { Snack.show(it.message ?: GENERIC_ERROR); load(true) }) { d ->
        TrackingService.start(c.app, d.orderId)
        Snack.show("Delivery ${d.orderNumber} accepted")
        load(true)
        then(d)
    }

    fun reject(orderId: Int, reason: String, then: () -> Unit = {}) = act("reject:$orderId", { c.repository.reject(orderId, reason) }) {
        Snack.show("Delivery rejected. The kitchen will assign someone else.")
        load(true)
        then()
    }
}

/** A list/detail screen with no extra actions. */
class SimpleVm<T>(c: AppContainer, private val source: suspend AppContainer.() -> Result<Loaded<T>>) : LoadVm<T>(c) {
    override suspend fun fetch() = c.source()
}

fun <T> Result<T>.loaded(): Result<Loaded<T>> = map { Loaded(it) }

/** Phone, maps and settings intents. Calls always open the dialer first: nothing is ever dialled automatically. */
object Intents {
    fun dial(ctx: Context, phone: String?) {
        val number = phone?.filter { it.isDigit() || it == '+' }.orEmpty()
        if (number.isBlank()) { Snack.show("No phone number available."); return }
        start(ctx, Intent(Intent.ACTION_DIAL, Uri.parse("tel:$number")), "No phone app found.")
    }

    /** Turn-by-turn navigation in Google Maps (two-wheeler mode), falling back to any maps app. */
    fun navigate(ctx: Context, lat: Double?, lng: Double?, address: String?) {
        val hasPoint = lat != null && lng != null
        val google = Intent(Intent.ACTION_VIEW, Uri.parse(if (hasPoint) "google.navigation:q=$lat,$lng&mode=l" else "google.navigation:q=${Uri.encode(address.orEmpty())}&mode=l"))
            .setPackage("com.google.android.apps.maps")
        try { ctx.startActivity(google.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return } catch (_: ActivityNotFoundException) {}
        val geo = if (hasPoint) "geo:$lat,$lng?q=$lat,$lng" else "geo:0,0?q=${Uri.encode(address.orEmpty())}"
        start(ctx, Intent(Intent.ACTION_VIEW, Uri.parse(geo)), "Install a maps app to navigate.")
    }

    fun appSettings(ctx: Context) = start(ctx, Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${ctx.packageName}")), null)
    fun locationSettings(ctx: Context) = start(ctx, Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS), null)
    fun notificationSettings(ctx: Context) = start(ctx, Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, ctx.packageName), null)
    fun batterySettings(ctx: Context) = start(ctx, Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS), null)

    private fun start(ctx: Context, i: Intent, notFound: String?) {
        try { ctx.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: ActivityNotFoundException) { notFound?.let(Snack::show) ?: appSettings(ctx) }
    }
}

/** Asks for precise location; [onResult] gets true when any location access was granted. */
@Composable
fun rememberLocationPermission(onResult: (Boolean) -> Unit) = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { r ->
    onResult(r.values.any { it })
}.let { launcher -> { launcher.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)) } }

/** Runs [block] every [periodMs] while the screen is visible, and pauses when the app goes to the background. */
@Composable
fun RefreshWhileVisible(periodMs: Long, block: suspend () -> Unit) {
    val owner = androidx.lifecycle.compose.LocalLifecycleOwner.current
    androidx.compose.runtime.LaunchedEffect(owner) {
        owner.repeatOnLifecycle(androidx.lifecycle.Lifecycle.State.STARTED) {
            while (true) { block(); kotlinx.coroutines.delay(periodMs) }
        }
    }
}
