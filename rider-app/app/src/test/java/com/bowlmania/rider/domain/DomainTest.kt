package com.bowlmania.rider.domain

import com.bowlmania.rider.data.net.Delivery
import com.bowlmania.rider.data.net.Payment
import com.bowlmania.rider.data.net.Proof
import com.bowlmania.rider.data.net.Requirements
import com.bowlmania.rider.data.net.json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DomainTest {
    private fun delivery(status: String, next: List<String> = emptyList(), req: Requirements = Requirements(), proof: Proof = Proof(), payment: Payment = Payment("cod", collectAmount = 420)) =
        Delivery(orderId = 1, orderNumber = "BM-1001", orderStatus = "out_for_delivery", status = status, next = next, requirements = req, proof = proof, payment = payment)

    @Test fun stagesMarkReachedStepsAndCurrent() {
        val stages = DeliveryFlow.stages(delivery("picked_up"))
        val byKey = stages.associateBy { it.key }
        assertTrue(byKey.getValue("assigned").done)
        assertTrue(byKey.getValue("picked_up").done)
        assertFalse(byKey.getValue("out_for_delivery").done)
        assertEquals("out_for_delivery", stages.single { it.current }.key)
    }

    @Test fun stagesHideDisabledRequirements() {
        val keys = DeliveryFlow.stages(delivery("accepted", req = Requirements(deliveryOtp = false, proofPhoto = false, signature = false))).map { it.key }
        assertFalse("otp_verified" in keys)
        assertFalse("proof" in keys)
        assertEquals("delivered", keys.last())
    }

    @Test fun actionsFollowServerOrderAndFlagOtpAndProof() {
        val actions = DeliveryFlow.actions(delivery("otp_verified", next = listOf("collect_cash", "proof", "unknown_step")))
        assertEquals(listOf("collect_cash", "proof"), actions.map { it.step })
        assertEquals("Confirm cash received ₹420", actions[0].label)
        assertTrue(actions[1].opensProof)
        assertTrue(DeliveryFlow.actions(delivery("at_customer", next = listOf("verify_delivery"))).single().needsOtp)
        assertFalse(DeliveryFlow.actions(delivery("at_restaurant", next = listOf("verify_pickup"), req = Requirements(pickupOtp = false))).single().needsOtp)
    }

    @Test fun headingToCustomerAfterPickup() {
        assertFalse(DeliveryFlow.headingToCustomer("at_restaurant"))
        assertTrue(DeliveryFlow.headingToCustomer("picked_up"))
        assertTrue(DeliveryFlow.headingToCustomer("at_customer"))
        assertTrue(DeliveryFlow.isActive("accepted"))
        assertFalse(DeliveryFlow.isActive("assigned"))
        assertFalse(DeliveryFlow.isActive("delivered"))
    }

    @Test fun rupeesUseIndianGrouping() {
        assertEquals("₹420", Money.rupees(420))
        assertEquals("₹1,25,000", Money.rupees(125000))
    }

    @Test fun haversineAndEstimate() {
        val km = Geo.haversineKm(22.7868, 86.1848, 22.8046, 86.2029)
        assertTrue(km in 2.5..2.9)
        val e = Geo.estimate(km)
        assertTrue(e.approximate)
        assertTrue(e.distanceText.startsWith("≈ "))
        assertTrue(e.minutes >= 1)
        assertFalse(Geo.validCoordinate(0.0, 0.0))
        assertFalse(Geo.validCoordinate(null, 86.0))
        assertTrue(Geo.validCoordinate(22.8, 86.2))
    }

    @Test fun parsesServerTimes() {
        assertNotNull(Times.parse("2026-09-27 10:15:00"))
        assertNotNull(Times.parse("2026-09-27T10:15:00.000Z"))
        assertEquals(Times.parse("2026-09-27 10:15:00"), Times.parse("2026-09-27T10:15:00Z"))
        assertNull(Times.parse(""))
        assertNull(Times.parse("not a time"))
        assertEquals("3:45 PM", Times.clock("2026-09-27 10:15:00")) // UTC → IST
        assertEquals("01:02:03", Times.duration(3723))
    }

    @Test fun deliveryJsonHasNoRiderPayFields() {
        val d = json.decodeFromString(Delivery.serializer(), """{"order_id":5,"order_number":"BM-5","order_status":"ready","status":"assigned","delivery_fee":40,"payment":{"method":"cod","collect_amount":300}}""")
        assertEquals(300, d.payment.collectAmount)
        val encoded = json.encodeToString(Delivery.serializer(), d)
        listOf("fee", "earning", "commission", "incentive", "bonus", "tip", "payout").forEach { assertFalse("\"$it", encoded.contains(it, ignoreCase = true)) }
    }
}
