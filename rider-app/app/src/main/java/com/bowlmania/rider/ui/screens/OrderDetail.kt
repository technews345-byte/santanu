@file:OptIn(ExperimentalMaterial3Api::class)

package com.bowlmania.rider.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Help
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.bowlmania.rider.AppContainer
import com.bowlmania.rider.BuildConfig
import com.bowlmania.rider.data.net.Delivery
import com.bowlmania.rider.data.net.Place
import com.bowlmania.rider.domain.DeliveryFlow
import com.bowlmania.rider.domain.Estimate
import com.bowlmania.rider.domain.Geo
import com.bowlmania.rider.domain.Money
import com.bowlmania.rider.domain.NextAction
import com.bowlmania.rider.location.Locations
import com.bowlmania.rider.location.TrackingService
import com.bowlmania.rider.ui.*
import com.bowlmania.rider.ui.components.*
import com.bowlmania.rider.ui.theme.LocalStatus
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.BitmapDescriptorFactory
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.LatLngBounds
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.MapProperties
import com.google.maps.android.compose.MapUiSettings
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.MarkerState
import com.google.maps.android.compose.rememberCameraPositionState
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow

class OrderVm(c: AppContainer, val orderId: Int) : LoadVm<Delivery>(c) {
    val otpError = MutableStateFlow<String?>(null)
    val here = MutableStateFlow<LatLng?>(null)
    val estimate = MutableStateFlow<Estimate?>(null)

    override suspend fun fetch() = c.repository.delivery(orderId)

    fun step(step: String, otp: String? = null, onOk: (Delivery) -> Unit = {}) = act("step:$step", {
        val loc = Locations.current(c.app, 4_000)
        c.repository.step(orderId, step, keyFor("step:$step"), otp, loc?.latitude, loc?.longitude)
    }, onError = { e ->
        if (otp != null) otpError.value = e.message else com.bowlmania.rider.ui.Snack.show(e.message ?: GENERIC_ERROR)
        load(true)
    }) { d ->
        otpError.value = null
        setData(d)
        if (d.status == "delivered") TrackingService.start(c.app, null) else TrackingService.start(c.app, d.orderId)
        onOk(d)
    }

    /** Where the rider is and how far the next stop is (road route when a Maps key is set, otherwise approximate). */
    suspend fun refreshPosition() {
        val loc = Locations.current(c.app, 8_000) ?: return
        here.value = LatLng(loc.latitude, loc.longitude)
        val d = state.value.data ?: return
        val to = if (DeliveryFlow.headingToCustomer(d.status)) d.customer else d.restaurant
        if (Geo.validCoordinate(to.lat, to.lng)) estimate.value = c.routes.estimate(loc.latitude, loc.longitude, to.lat!!, to.lng!!)
    }
}

@Composable
fun OrderDetailScreen(orderId: Int, nav: Nav) {
    val c = appContainer()
    val ctx = LocalContext.current
    val vm: OrderVm = viewModel(key = "order$orderId") { OrderVm(c, orderId) }
    val st by vm.state.collectAsState()
    val busy by vm.busy.collectAsState()
    val otpError by vm.otpError.collectAsState()
    val here by vm.here.collectAsState()
    val estimate by vm.estimate.collectAsState()
    var otpFor by remember { mutableStateOf<NextAction?>(null) }
    var confirm by remember { mutableStateOf<NextAction?>(null) }
    var rejecting by remember { mutableStateOf(false) }

    RefreshWhileVisible(20_000) { vm.load(silent = vm.state.value.data != null) }
    LaunchedEffect(st.data?.status) { while (st.data != null && DeliveryFlow.isActive(st.data!!.status)) { vm.refreshPosition(); delay(15_000) } }

    Column(Modifier.fillMaxSize()) {
        AppBar(st.data?.let { "#${it.orderNumber}" } ?: "Order", onBack = nav::back, actions = {
            IconButton(onClick = { nav.open("support/new?order=$orderId") }) { Icon(Icons.AutoMirrored.Filled.Help, "Report a problem with this order") }
            IconButton(onClick = { nav.open("safety?order=$orderId") }) { Icon(Icons.Filled.Shield, "Safety and emergency", tint = LocalStatus.current.danger) }
        })
        CachedNotice(st.cachedAt)
        val d = st.data
        when {
            d == null && st.loading -> Skeleton(5)
            d == null -> ErrorState(st.error ?: GENERIC_ERROR, { vm.load() })
            else -> {
                Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    StatusHeader(d)
                    if (BuildConfig.MAPS_API_KEY.isNotBlank()) DeliveryMap(d, here)
                    if (d.status != "delivered" && d.status != "cancelled") NextStop(d, estimate)
                    PaymentCard(d)
                    SectionCard(title = "Restaurant") { PlaceDetails(Icons.Filled.Restaurant, d.restaurant, showNavigate = !DeliveryFlow.headingToCustomer(d.status) && DeliveryFlow.isActive(d.status)) }
                    SectionCard(title = "Customer") { PlaceDetails(Icons.Outlined.Home, d.customer, showNavigate = DeliveryFlow.headingToCustomer(d.status) && DeliveryFlow.isActive(d.status)) }
                    SectionCard(title = "Items") {
                        d.items.forEach { i ->
                            Row {
                                Text("${i.quantity} ×", fontWeight = FontWeight.Bold, modifier = Modifier.width(40.dp))
                                Text(i.name + if (i.size.isNotBlank()) " (${i.size})" else "", Modifier.weight(1f))
                            }
                        }
                        d.slot?.label?.takeIf { it.isNotBlank() }?.let { Text("Delivery slot: $it", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    }
                    SectionCard(title = "Progress") { StepTimeline(DeliveryFlow.stages(d)) }
                    Spacer(Modifier.height(8.dp))
                }
                val actions = DeliveryFlow.actions(d).filter { it.step != "reject" }
                if (actions.isNotEmpty()) Surface(tonalElevation = 3.dp, shadowElevation = 8.dp) {
                    Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        actions.forEachIndexed { i, a ->
                            val run: () -> Unit = {
                                when {
                                    a.step == "accept" -> vm.accept(orderId) { vm.load(true) }
                                    a.needsOtp -> otpFor = a
                                    a.opensProof -> nav.open("proof/$orderId")
                                    a.step == "collect_cash" || a.step == "deliver" -> confirm = a
                                    else -> vm.step(a.step)
                                }
                            }
                            val loading = busy == "step:${a.step}" || busy == "accept:$orderId"
                            if (i == 0) BigButton(a.label, onClick = run, loading = loading, enabled = busy == null)
                            else OutlinedButton(onClick = run, enabled = busy == null, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text(a.label.uppercase()) }
                        }
                        if ("reject" in d.next) TextButton(onClick = { rejecting = true }, enabled = busy == null, modifier = Modifier.fillMaxWidth()) {
                            Text("REJECT THIS DELIVERY", color = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }
        }
    }

    val d = st.data
    otpFor?.let { a ->
        if (d != null) OtpDialog(
            title = if (a.step == "verify_pickup") "Pickup code" else "Customer's delivery code",
            subtitle = if (a.step == "verify_pickup") "Ask the restaurant staff for the 4-digit pickup code on the order." else "Ask the customer for the 4-digit code they received with their order.",
            attemptsLeft = if (a.step == "verify_pickup") d.otpAttemptsLeft.pickup else d.otpAttemptsLeft.delivery,
            error = otpError, loading = busy == "step:${a.step}",
            onSubmit = { code -> vm.step(a.step, code) { otpFor = null; Snack.show(if (a.step == "verify_pickup") "Pickup confirmed" else "Code verified") } },
            onDismiss = { otpFor = null; vm.otpError.value = null },
        )
    }
    confirm?.let { a ->
        if (d != null) ConfirmDialog(
            title = if (a.step == "collect_cash") "Cash received?" else "Complete delivery?",
            text = if (a.step == "collect_cash") "Confirm you have received ${Money.rupees(d.payment.collectAmount)} in cash from the customer." else "Confirm the order was handed to the customer.",
            confirm = if (a.step == "collect_cash") "Yes, received" else "Delivered",
            onConfirm = {
                confirm = null
                vm.step(a.step) { if (it.status == "delivered") { Snack.show("Delivery #${it.orderNumber} completed. Well done!"); nav.back() } }
            },
            onDismiss = { confirm = null },
        )
    }
    if (rejecting && d != null) RejectDialog(d.orderNumber, { r -> rejecting = false; vm.reject(orderId, r) { nav.back() } }, { rejecting = false })
}

@Composable
private fun StatusHeader(d: Delivery) {
    val color = statusColor(d.status)
    Surface(color = color.copy(alpha = 0.12f), shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(d.statusLabel.ifBlank { d.status }, style = MaterialTheme.typography.headlineSmall, color = color)
            Text(
                when (d.status) {
                    "assigned" -> "Accept to start this delivery."
                    "cancelled" -> "This order was cancelled. Return any food to the restaurant."
                    "delivered" -> "This delivery is complete."
                    else -> if (DeliveryFlow.headingToCustomer(d.status)) "Deliver to ${d.customer.name.ifBlank { "the customer" }}" else "Pick up from ${d.restaurant.name.ifBlank { "the restaurant" }}"
                },
                style = MaterialTheme.typography.bodyLarge,
            )
        }
    }
}

@Composable
private fun NextStop(d: Delivery, estimate: Estimate?) {
    val toCustomer = DeliveryFlow.headingToCustomer(d.status)
    val p = if (toCustomer) d.customer else d.restaurant
    val ctx = LocalContext.current
    SectionCard(title = if (toCustomer) "Next stop · customer" else "Next stop · restaurant") {
        Text(p.name.ifBlank { if (toCustomer) "Customer" else "Restaurant" }, style = MaterialTheme.typography.titleLarge)
        if (!p.address.isNullOrBlank()) Text(p.address, style = MaterialTheme.typography.bodyLarge)
        if (estimate != null) Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Text(estimate.distanceText, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
            Text(estimate.timeText, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Button(onClick = { Intents.navigate(ctx, p.lat, p.lng, p.address) }, modifier = Modifier.weight(1f).heightIn(min = 52.dp)) {
                Icon(Icons.Filled.Navigation, null); Spacer(Modifier.width(8.dp)); Text("NAVIGATE")
            }
            if (!p.phone.isNullOrBlank()) OutlinedButton(onClick = { Intents.dial(ctx, p.phone) }, modifier = Modifier.weight(1f).heightIn(min = 52.dp)) {
                Icon(Icons.Filled.Call, null); Spacer(Modifier.width(8.dp)); Text("CALL")
            }
        }
    }
}

@Composable
private fun PaymentCard(d: Delivery) {
    val s = LocalStatus.current
    val p = d.payment
    val (bg, fg) = when { p.prepaid || p.cashCollected -> s.online to s.online; else -> s.warning to s.warning }
    Surface(color = bg.copy(alpha = 0.12f), shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(if (p.prepaid) Icons.Filled.CreditScore else Icons.Filled.Payments, null, tint = fg, modifier = Modifier.size(32.dp))
            Spacer(Modifier.width(14.dp))
            Column {
                if (p.prepaid) {
                    Text("Paid online", style = MaterialTheme.typography.titleLarge, color = fg)
                    Text("Do not collect any cash from the customer.", style = MaterialTheme.typography.bodyMedium)
                } else {
                    Text("Customer must pay ${Money.rupees(p.collectAmount)}", style = MaterialTheme.typography.titleLarge, color = fg)
                    Text(if (p.cashCollected) "Cash received${p.cashCollectedAt?.let { " at " + com.bowlmania.rider.domain.Times.clock(it) } ?: ""}" else "Payment method: Cash on delivery",
                        style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
}

@Composable
private fun PlaceDetails(icon: androidx.compose.ui.graphics.vector.ImageVector, p: Place, showNavigate: Boolean) {
    val ctx = LocalContext.current
    PlaceLine(icon, p.name.ifBlank { "—" }, p.address)
    if (!p.landmark.isNullOrBlank()) Text("Landmark: ${p.landmark}", style = MaterialTheme.typography.bodyMedium)
    if (!p.instructions.isNullOrBlank()) Surface(color = MaterialTheme.colorScheme.tertiaryContainer, shape = MaterialTheme.shapes.small) {
        Text(p.instructions, Modifier.padding(10.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onTertiaryContainer)
    }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        if (!p.phone.isNullOrBlank()) AssistChip(onClick = { Intents.dial(ctx, p.phone) }, label = { Text("Call") }, leadingIcon = { Icon(Icons.Filled.Call, null, Modifier.size(18.dp)) })
        if (showNavigate || !p.address.isNullOrBlank()) AssistChip(onClick = { Intents.navigate(ctx, p.lat, p.lng, p.address) }, label = { Text("Directions") },
            leadingIcon = { Icon(Icons.Filled.Directions, null, Modifier.size(18.dp)) })
    }
}

@Composable
private fun DeliveryMap(d: Delivery, here: LatLng?) {
    val rest = d.restaurant.takeIf { Geo.validCoordinate(it.lat, it.lng) }?.let { LatLng(it.lat!!, it.lng!!) }
    val cust = d.customer.takeIf { Geo.validCoordinate(it.lat, it.lng) }?.let { LatLng(it.lat!!, it.lng!!) }
    val points = listOfNotNull(rest, cust, here)
    if (points.isEmpty()) return
    val camera = rememberCameraPositionState()
    var loaded by remember { mutableStateOf(false) }
    LaunchedEffect(loaded, points.size, rest, cust) {
        if (!loaded) return@LaunchedEffect
        runCatching {
            if (points.size == 1) camera.move(CameraUpdateFactory.newLatLngZoom(points[0], 15f))
            else camera.move(CameraUpdateFactory.newLatLngBounds(LatLngBounds.builder().apply { points.forEach(::include) }.build(), 120))
        }
    }
    Box(Modifier.fillMaxWidth().height(220.dp).background(MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.shapes.large)) {
        GoogleMap(
            modifier = Modifier.matchParentSize(),
            cameraPositionState = camera,
            properties = MapProperties(isMyLocationEnabled = false),
            uiSettings = MapUiSettings(zoomControlsEnabled = false, mapToolbarEnabled = false),
            onMapLoaded = { loaded = true },
        ) {
            rest?.let { Marker(state = MarkerState(it), title = d.restaurant.name.ifBlank { "Restaurant" }, icon = BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_ORANGE)) }
            cust?.let { Marker(state = MarkerState(it), title = d.customer.name.ifBlank { "Customer" }, icon = BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_GREEN)) }
            here?.let { Marker(state = MarkerState(it), title = "You", icon = BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_AZURE)) }
        }
    }
}
