package com.bowlmania.rider.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.selectable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.bowlmania.rider.data.net.Delivery
import com.bowlmania.rider.data.net.Payment
import com.bowlmania.rider.domain.Money
import com.bowlmania.rider.ui.components.SectionCard
import com.bowlmania.rider.ui.components.StatusChip
import com.bowlmania.rider.ui.components.statusColor
import com.bowlmania.rider.ui.theme.LocalStatus

/** Compact order card used on Home and Orders. New assignments get Accept / Reject buttons. */
@Composable
fun DeliveryCard(d: Delivery, onOpen: () -> Unit, busy: String?, onAccept: (() -> Unit)? = null, onReject: (() -> Unit)? = null) {
    SectionCard(Modifier.clickable(onClickLabel = "Open order ${d.orderNumber}", onClick = onOpen)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("#${d.orderNumber}", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
            StatusChip(d.statusLabel.ifBlank { d.status }, statusColor(d.status))
        }
        PlaceLine(Icons.Filled.Restaurant, d.restaurant.name.ifBlank { "Restaurant" }, d.restaurant.address)
        PlaceLine(Icons.Outlined.Home, d.customer.name.ifBlank { "Customer" }, listOfNotNull(d.customer.address?.takeIf { it.isNotBlank() }, d.deliveryDistanceKm?.let { "%.1f km".format(it) }).joinToString(" · "))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            PaymentBadge(d.payment)
            d.slot?.label?.takeIf { it.isNotBlank() }?.let {
                Icon(Icons.Filled.Schedule, null, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(it, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Spacer(Modifier.weight(1f))
            Text("${d.items.sumOf { it.quantity }} items", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (onAccept != null && onReject != null) Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedButton(onClick = onReject, enabled = busy == null, modifier = Modifier.weight(1f).heightIn(min = 52.dp)) { Text("REJECT") }
            Button(onClick = onAccept, enabled = busy == null, modifier = Modifier.weight(1.4f).heightIn(min = 52.dp)) {
                if (busy == "accept:${d.orderId}") CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = LocalContentColor.current) else Text("ACCEPT")
            }
        }
    }
}

@Composable
fun PlaceLine(icon: ImageVector, title: String, subtitle: String?) {
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Icon(icon, null, Modifier.size(20.dp).padding(top = 2.dp), tint = MaterialTheme.colorScheme.primary)
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (!subtitle.isNullOrBlank()) Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}

/** Cash to collect (operational) or "Paid online". Never shows any fee or rider pay. */
@Composable
fun PaymentBadge(p: Payment) {
    val s = LocalStatus.current
    if (p.prepaid) StatusChip("Paid online", s.online, )
    else if (p.cashCollected) Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Filled.Verified, null, Modifier.size(16.dp), tint = s.online); Spacer(Modifier.width(4.dp))
        Text("Cash received", style = MaterialTheme.typography.labelMedium, color = s.online, fontWeight = FontWeight.Bold)
    }
    else Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Filled.Payments, null, Modifier.size(16.dp), tint = s.warning); Spacer(Modifier.width(4.dp))
        Text("Collect ${Money.rupees(p.collectAmount)} cash", style = MaterialTheme.typography.labelMedium, color = s.warning, fontWeight = FontWeight.Bold)
    }
}

private val REJECT_REASONS = listOf("Too far away", "Vehicle problem", "Already on another delivery", "Finishing work for today", "Health or safety reason", "Other")

@Composable
fun RejectDialog(orderNumber: String, onReject: (String) -> Unit, onDismiss: () -> Unit) {
    var choice by remember { mutableStateOf(REJECT_REASONS.first()) }
    var other by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Reject #$orderNumber?") },
        text = {
            Column {
                Text("Tell the kitchen why, so they can assign someone else quickly.", style = MaterialTheme.typography.bodyMedium)
                Spacer(Modifier.height(8.dp))
                REJECT_REASONS.forEach { r ->
                    Row(Modifier.fillMaxWidth().heightIn(min = 44.dp).selectable(choice == r, role = Role.RadioButton) { choice = r }, verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(selected = choice == r, onClick = null); Spacer(Modifier.width(8.dp)); Text(r)
                    }
                }
                if (choice == "Other") OutlinedTextField(other, { other = it.take(200) }, label = { Text("Reason") }, modifier = Modifier.fillMaxWidth())
            }
        },
        confirmButton = {
            Button(
                onClick = { onReject(if (choice == "Other") other.trim() else choice) },
                enabled = choice != "Other" || other.isNotBlank(),
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
            ) { Text("Reject") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
