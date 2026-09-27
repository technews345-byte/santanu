package com.bowlmania.rider.domain

import com.bowlmania.rider.data.net.Delivery

/** One stage of the delivery timeline shown to the rider. */
data class Stage(val key: String, val label: String, val time: String?, val done: Boolean, val current: Boolean)

/** What the big button on the order screen does next. */
data class NextAction(val step: String, val label: String, val needsOtp: Boolean = false, val opensProof: Boolean = false, val destructive: Boolean = false)

object DeliveryFlow {
    private val ORDER = listOf("assigned", "accepted", "to_restaurant", "at_restaurant", "picked_up", "out_for_delivery", "at_customer", "otp_verified", "delivered")

    val isActive: (String) -> Boolean = { it in ORDER && it != "assigned" && it != "delivered" }

    /** Before pickup the rider heads to the restaurant; afterwards to the customer. */
    fun headingToCustomer(status: String): Boolean = ORDER.indexOf(status) >= ORDER.indexOf("picked_up")

    fun stages(d: Delivery): List<Stage> {
        val t = d.times
        val list = listOf(
            Triple("assigned", "Assigned", t.assigned), Triple("accepted", "Accepted", t.accepted),
            Triple("to_restaurant", "Going to restaurant", t.toRestaurant), Triple("at_restaurant", "Arrived at restaurant", t.atRestaurant),
            Triple("picked_up", "Picked up", t.pickedUp), Triple("out_for_delivery", "Out for delivery", t.outForDelivery),
            Triple("at_customer", "Arrived at customer", t.atCustomer), Triple("otp_verified", "Delivery OTP verified", t.otpVerified),
            Triple("proof", "Proof of delivery", d.proof.at), Triple("delivered", "Delivered", t.delivered),
        ).filter { (k) -> !(k == "otp_verified" && !d.requirements.deliveryOtp) && !(k == "proof" && !d.requirements.proofPhoto && !d.requirements.signature && !d.proof.submitted) }
        val reached = { k: String -> if (k == "proof") d.proof.submitted else ORDER.indexOf(k) <= ORDER.indexOf(d.status) }
        val firstPending = list.indexOfFirst { !reached(it.first) }
        return list.mapIndexed { i, (k, label, time) -> Stage(k, label, time, reached(k), i == firstPending) }
    }

    /** The primary actions for the server's `next` list, in the order the rider should do them. */
    fun actions(d: Delivery): List<NextAction> = d.next.mapNotNull { step ->
        when (step) {
            "accept" -> NextAction("accept", "Accept delivery")
            "reject" -> NextAction("reject", "Reject", destructive = true)
            "start" -> NextAction("start", "Go to restaurant")
            "arrive_restaurant" -> NextAction("arrive_restaurant", "Arrived at restaurant")
            "verify_pickup" -> NextAction("verify_pickup", if (d.requirements.pickupOtp) "Verify pickup code" else "Confirm pickup", needsOtp = d.requirements.pickupOtp)
            "start_delivery" -> NextAction("start_delivery", "Start delivery")
            "arrive_customer" -> NextAction("arrive_customer", "Arrived at customer")
            "verify_delivery" -> NextAction("verify_delivery", "Enter customer's delivery code", needsOtp = true)
            "collect_cash" -> NextAction("collect_cash", "Confirm cash received ${Money.rupees(d.payment.collectAmount)}")
            "proof" -> NextAction("proof", "Proof of delivery", opensProof = true)
            "deliver" -> NextAction("deliver", "Complete delivery")
            else -> null
        }
    }
}

object Money {
    /** Formats the cash a customer must pay (the only amount riders ever see). */
    fun rupees(amount: Int): String {
        val digits = kotlin.math.abs(amount.toLong()).toString()
        // Indian grouping: last three digits, then pairs (1,25,000).
        val grouped = if (digits.length <= 3) digits else {
            val head = digits.dropLast(3)
            head.reversed().chunked(2).joinToString(",").reversed() + "," + digits.takeLast(3)
        }
        return (if (amount < 0) "-" else "") + "₹" + grouped
    }
}
