@file:OptIn(ExperimentalMaterial3Api::class)

package com.bowlmania.rider.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.bowlmania.rider.AppContainer
import com.bowlmania.rider.data.net.Deliveries
import com.bowlmania.rider.data.net.Delivery
import com.bowlmania.rider.ui.*
import com.bowlmania.rider.ui.components.*
import kotlinx.coroutines.delay

class OrdersVm(c: AppContainer) : LoadVm<Deliveries>(c) {
    override suspend fun fetch() = c.repository.deliveries()
}

@Composable
fun OrdersScreen(nav: Nav) {
    val c = appContainer()
    val vm: OrdersVm = viewModel { OrdersVm(c) }
    val st by vm.state.collectAsState()
    val busy by vm.busy.collectAsState()
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var rejecting by remember { mutableStateOf<Delivery?>(null) }
    RefreshWhileVisible(30_000) { vm.load(silent = vm.state.value.data != null) }

    Column(Modifier.fillMaxSize()) {
        AppBar("Orders", actions = { IconButton(onClick = { nav.open("history") }) { Icon(Icons.Filled.History, "Delivery history") } })
        val d = st.data
        val lists = listOf(d?.active.orEmpty(), d?.new.orEmpty(), d?.completedToday.orEmpty(), d?.cancelledToday.orEmpty())
        val labels = listOf("Active", "New", "Completed", "Cancelled")
        ScrollableTabRow(selectedTabIndex = tab, edgePadding = 12.dp, containerColor = MaterialTheme.colorScheme.background) {
            labels.forEachIndexed { i, l ->
                Tab(selected = tab == i, onClick = { tab = i }, text = { Text(if (d == null) l else "$l (${lists[i].size})") })
            }
        }
        CachedNotice(st.cachedAt)
        when {
            d == null && st.loading -> Skeleton(4)
            d == null -> ErrorState(st.error ?: GENERIC_ERROR, { vm.load() })
            else -> PullToRefreshBox(isRefreshing = st.loading, onRefresh = { vm.load() }, modifier = Modifier.fillMaxSize()) {
                val list = lists[tab]
                LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxSize()) {
                    if (list.isEmpty()) item {
                        EmptyState(
                            when (tab) { 0 -> Icons.Filled.DeliveryDining; 1 -> Icons.Filled.NotificationsNone; 2 -> Icons.Filled.TaskAlt; else -> Icons.Filled.Block },
                            when (tab) { 0 -> "No active deliveries"; 1 -> "No new deliveries"; 2 -> "Nothing completed yet today"; else -> "No cancelled deliveries today" },
                            if (tab == 1) "Stay online to receive new deliveries." else "",
                        )
                    }
                    items(list, key = { "${tab}_${it.orderId}" }) { o ->
                        DeliveryCard(o, onOpen = { nav.open("order/${o.orderId}") }, busy = busy,
                            onAccept = if (tab == 1) ({ vm.accept(o.orderId) { nav.open("order/${it.orderId}") } }) else null,
                            onReject = if (tab == 1) ({ rejecting = o }) else null)
                    }
                    item { Spacer(Modifier.height(24.dp)) }
                }
            }
        }
    }
    rejecting?.let { o -> RejectDialog(o.orderNumber, { r -> rejecting = null; vm.reject(o.orderId, r) }, { rejecting = null }) }
}
