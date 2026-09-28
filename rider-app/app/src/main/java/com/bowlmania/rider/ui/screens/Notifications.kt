@file:OptIn(ExperimentalMaterial3Api::class)

package com.bowlmania.rider.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.bowlmania.rider.AppContainer
import com.bowlmania.rider.data.net.NotificationList
import com.bowlmania.rider.data.net.RiderNotification
import com.bowlmania.rider.domain.Times
import com.bowlmania.rider.ui.*
import com.bowlmania.rider.ui.components.*
import com.bowlmania.rider.ui.theme.LocalStatus
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class NotificationsVm(c: AppContainer) : LoadVm<NotificationList>(c) {
    val loadingMore = MutableStateFlow(false)
    val endReached = MutableStateFlow(false)
    override suspend fun fetch() = c.repository.notifications().also { r -> r.onSuccess { endReached.value = it.data.rows.size < PAGE } }

    fun more() {
        val rows = state.value.data?.rows ?: return
        if (loadingMore.value || endReached.value || rows.isEmpty()) return
        viewModelScope.launch {
            loadingMore.value = true
            c.repository.notifications(rows.last().id).onSuccess { page ->
                endReached.value = page.data.rows.size < PAGE
                _state.update { s -> s.copy(data = s.data?.let { d -> d.copy(rows = (d.rows + page.data.rows).distinctBy { it.id }) }) }
            }.onFailure { Snack.show(it.message ?: GENERIC_ERROR) }
            loadingMore.value = false
        }
    }

    fun open(n: RiderNotification) {
        if (n.readAt != null) return
        _state.update { s -> s.copy(data = s.data?.let { d -> d.copy(rows = d.rows.map { if (it.id == n.id) it.copy(readAt = "now") else it }, unread = (d.unread - 1).coerceAtLeast(0)) }) }
        viewModelScope.launch { c.repository.markRead(listOf(n.id)) }
    }

    fun readAll() = act("read", { c.repository.markRead(null) }) { load(true) }
    fun clearRead() = act("clear", { c.repository.clearRead() }) { Snack.show("Read notifications cleared"); load(true) }

    companion object { const val PAGE = 50 }
}

@Composable
fun NotificationsScreen(nav: Nav, onUnread: (Int) -> Unit) {
    val c = appContainer()
    val vm: NotificationsVm = viewModel { NotificationsVm(c) }
    val st by vm.state.collectAsState()
    val busy by vm.busy.collectAsState()
    val loadingMore by vm.loadingMore.collectAsState()
    val end by vm.endReached.collectAsState()
    var menu by remember { mutableStateOf(false) }
    RefreshWhileVisible(30_000) { vm.load(silent = vm.state.value.data != null) }
    LaunchedEffect(st.data?.unread) { st.data?.let { onUnread(it.unread) } }

    Column(Modifier.fillMaxSize()) {
        AppBar("Notifications", actions = {
            Box {
                IconButton(onClick = { menu = true }, enabled = busy == null) { Icon(Icons.Filled.MoreVert, "More options") }
                DropdownMenu(menu, { menu = false }) {
                    DropdownMenuItem(text = { Text("Mark all as read") }, leadingIcon = { Icon(Icons.Filled.DoneAll, null) }, onClick = { menu = false; vm.readAll() })
                    DropdownMenuItem(text = { Text("Clear read notifications") }, leadingIcon = { Icon(Icons.Filled.DeleteSweep, null) }, onClick = { menu = false; vm.clearRead() })
                }
            }
        })
        CachedNotice(st.cachedAt)
        val d = st.data
        when {
            d == null && st.loading -> Skeleton(6)
            d == null -> ErrorState(st.error ?: GENERIC_ERROR, { vm.load() })
            else -> PullToRefreshBox(isRefreshing = st.loading, onRefresh = { vm.load() }, modifier = Modifier.fillMaxSize()) {
                LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(vertical = 8.dp)) {
                    if (d.rows.isEmpty()) item { EmptyState(Icons.Filled.NotificationsNone, "No notifications", "New deliveries, order changes and messages from the kitchen appear here.") }
                    items(d.rows, key = { it.id }) { n ->
                        NotificationRow(n) {
                            vm.open(n)
                            when {
                                n.orderId != null && n.type != "order_reassigned" -> nav.open("order/${n.orderId}")
                                n.ticketId != null -> nav.open("ticket/${n.ticketId}")
                            }
                        }
                        HorizontalDivider(Modifier.padding(start = 72.dp), color = MaterialTheme.colorScheme.outlineVariant)
                    }
                    if (d.rows.isNotEmpty() && !end) item {
                        LaunchedEffect(d.rows.size) { vm.more() }
                        Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
                            if (loadingMore) CircularProgressIndicator(Modifier.size(24.dp)) else TextButton(onClick = vm::more) { Text("Load more") }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun NotificationRow(n: RiderNotification, onClick: () -> Unit) {
    val s = LocalStatus.current
    val (icon, color) = notificationStyle(n.type, s)
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        Box(Modifier.size(42.dp).clip(CircleShape).background(color.copy(alpha = 0.14f)), contentAlignment = Alignment.Center) { Icon(icon, null, tint = color) }
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(n.title, style = MaterialTheme.typography.bodyLarge, fontWeight = if (n.readAt == null) FontWeight.Bold else FontWeight.Normal, modifier = Modifier.weight(1f))
                if (n.readAt == null) Box(Modifier.size(9.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary))
            }
            if (n.body.isNotBlank()) Text(n.body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(Times.ago(n.createdAt), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

private fun notificationStyle(type: String, s: com.bowlmania.rider.ui.theme.StatusColors): Pair<ImageVector, androidx.compose.ui.graphics.Color> = when (type) {
    "new_delivery", "assignment" -> Icons.Filled.DeliveryDining to s.info
    "order_ready" -> Icons.Filled.Restaurant to s.online
    "order_cancelled", "order_reassigned" -> Icons.Filled.Cancel to s.danger
    "order_update" -> Icons.Filled.EditLocationAlt to s.warning
    "support", "support_reply" -> Icons.AutoMirrored.Filled.Chat to s.info
    "attendance", "leave" -> Icons.Filled.EventAvailable to s.online
    "emergency" -> Icons.Filled.Warning to s.danger
    else -> Icons.Filled.Campaign to s.info
}
