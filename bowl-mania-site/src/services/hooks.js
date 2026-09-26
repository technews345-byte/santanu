// Side effects of order lifecycle events: notification center, live admin updates and customer WhatsApp messages.
import { db } from '../db/index.js';
import { emit } from '../lib/events.js';
import { notifyAdmins } from './notifications.js';
import { sendOrderMessage } from './whatsapp.js';
import { config } from '../config.js';

const vars = (o, extra = {}) => {
  const rider = db.prepare('SELECT a.name, a.phone FROM delivery_assignments d JOIN admins a ON a.id=d.staff_id WHERE d.order_id=?').get(o.id);
  return {
    customer_name: o.customer_name.split(' ')[0], order_id: o.order_number, amount: o.total,
    tracking_url: `${config.publicUrl}/track/${o.tracking_token}`, status: o.status,
    rider_name: rider?.name || 'our delivery partner', rider_phone: rider?.phone || '',
    pickup_note: o.fulfilment === 'pickup' ? ` for pickup at ${o.area_name || 'our kitchen'}` : '', ...extra
  };
};
const summary = o => ({ id: o.id, order_number: o.order_number, customer_name: o.customer_name, total: o.total, fulfilment: o.fulfilment,
  payment_method: o.payment_method, payment_status: o.payment_status, status: o.status, area_name: o.area_name,
  items: o.items.map(i => `${i.quantity}× ${i.name} (${i.size_label})`) });

const STATUS_EVENT = { confirmed: 'order_confirmed', accepted: null, preparing: 'preparing', ready: 'ready', out_for_delivery: 'out_for_delivery', delivered: 'delivered', cancelled: 'cancelled' };

export const hooks = {
  /** A COD order was created, or an online order's payment was confirmed. */
  orderPlaced(o) {
    notifyAdmins({ type: 'new_order', title: `New order ${o.order_number}`, body: `${o.customer_name} · ₹${o.total} · ${o.fulfilment === 'pickup' ? 'Pickup' : 'Delivery'} · ${o.payment_method === 'online' ? 'Paid online' : 'Cash on delivery'}`,
      link: `#/orders/${o.id}`, permission: 'orders.view', data: { order: summary(o), sound: true } });
    sendOrderMessage('order_received', o, vars(o));
  },
  paymentSucceeded(o) {
    notifyAdmins({ type: 'payment_received', title: `Payment received for ${o.order_number}`, body: `₹${o.total} paid online by ${o.customer_name}`, link: `#/orders/${o.id}`, permission: 'payments.view' });
    sendOrderMessage('payment_success', o, vars(o));
  },
  paymentFailed(o, reason) {
    notifyAdmins({ type: 'payment_failed', title: `Payment failed for ${o.order_number}`, body: `${o.customer_name} · ₹${o.total}${reason ? ' · ' + reason : ''}`, link: `#/orders/${o.id}`, permission: 'payments.view' });
  },
  refundProcessed(o, amount) {
    sendOrderMessage('refund_processed', o, vars(o, { refund_amount: amount }));
  },
  statusChanged(o, from, to, admin) {
    emit('order_updated', { ...summary(o), from }, 'orders.view');
    if (to === 'cancelled') notifyAdmins({ type: 'order_cancelled', title: `Order ${o.order_number} cancelled`, body: `${admin ? 'By ' + admin.name : 'Automatically'} · ₹${o.total}`, link: `#/orders/${o.id}`, permission: 'orders.view' });
    const ev = STATUS_EVENT[to];
    if (ev) sendOrderMessage(ev, o, vars(o));
  }
};
