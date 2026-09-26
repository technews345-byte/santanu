# Bowl Mania API

All endpoints are JSON over HTTPS under `/api`. Money is in whole rupees. Times are UTC (`YYYY-MM-DD HH:MM:SS` or ISO 8601); the restaurant timezone comes from settings (default `Asia/Kolkata`).

Errors always look like `{ "error": "Human-readable message", "details": [...] }`, with status 400 (invalid input), 401 (not signed in), 403 (no permission or failed CSRF check), 404, 409 (conflict, e.g. an invalid status change), 413, 429 (rate limited) or 5xx.

## Public (website)

| Method & path | Purpose |
|---|---|
| `GET /public/config` | Restaurant details, business rules, open/closed status, payment options (Razorpay key id only), delivery areas with slots and fee rules |
| `GET /menu` | `{ categories, items }`: enabled items with `sizes[{id,label,price}]`, `available`, `diet`, `spicy`, `featured`, `nutrition` |
| `GET /delivery/areas` | Delivery areas (same as in config) |
| `POST /delivery/calculate` `{lat,lng}` | `{eligible, area, distance_km, fee}` or `{eligible:false, message}` |
| `GET /public/slots?area_id=` | Upcoming slots for a kitchen |
| `POST /checkout/quote` | Price a cart: `{items[{item_id,size_id,quantity}], fulfilment, area_id?, lat?, lng?, coupon_code?, phone?}` → subtotal, offer, coupon, delivery, tax, total, slots, payment options |
| `POST /coupons/validate` | Same body with `coupon_code` → coupon result |
| `POST /orders` | Create an order: `customer_name, phone, email?, fulfilment, area_id (pickup), lat/lng/address/landmark (delivery), slot_key, items, coupon_code?, payment_method ('online'|'cod'), notes?` → `{order_number, tracking_token, total, payment?}`. `payment` holds the Razorpay order for Checkout |
| `POST /payments/verify` | Razorpay Checkout callback fields → verified server-side → `{ok, tracking_token}` |
| `POST /payments/failed` | Report a failed/cancelled checkout (never marks anything paid) |
| `POST /payments/webhook` | Razorpay webhook (HMAC `X-Razorpay-Signature`, idempotent by `X-Razorpay-Event-Id`) |
| `GET/POST /whatsapp/webhook` | Meta verification and signed delivery receipts |
| `GET /track/:token` | Public order status (no phone or address) |
| `POST /track/lookup` `{order_number, phone}` | Returns the tracking token when both match |
| `POST /track/:token/review` `{rating, comment}` | One review per delivered order (held for approval) |
| `GET /reviews` · `GET /offers` · `GET /gallery` | Approved reviews, live offers, active media |
| `POST /contact` `{name, phone?, email?, message}` | Contact form → admin inquiries |

## Staff authentication

Cookies: `bm_at` (access, 15 min), `bm_rt` (refresh, rotated, 30 days), `bm_csrf` (readable). Every admin `POST/PUT/PATCH/DELETE` must send header `X-CSRF-Token` equal to the `bm_csrf` cookie.

| Method & path | Purpose |
|---|---|
| `POST /auth/login` `{email, password}` | Start a session → `{admin, csrf}` |
| `POST /auth/refresh` | Rotate the refresh token, new access token |
| `POST /auth/logout` | End the session |
| `GET /auth/me` | Current staff member and permissions |
| `POST /auth/password` `{current, password}` | Change own password (signs out other devices) |
| `POST /auth/forgot` `{email}` · `POST /auth/reset` `{token, password}` | Password reset by email link |

## Admin (permission in brackets)

**Live & dashboard**
- `GET /admin/events`: Server-Sent Events: `notification`, `order_updated`, `menu_changed`, `status_changed` (signed in)
- `GET /admin/dashboard?preset=today|yesterday|last7|last30|this_month|custom&from&to` [dashboard.view]
- `GET /admin/analytics?preset&from&to&grain=auto|day|week|month` [analytics.view]
- `GET /admin/status` · `PATCH /admin/restaurant-status {mode:auto|open|closed}` [settings.manage or orders.update]

**Orders**
- `GET /admin/orders?status&payment_status&payment_method&area_id&fulfilment&from&to&q&sort&dir&page&limit` [orders.view]
- `GET /admin/orders/:id`: items, history, payments, refunds, assignment, WhatsApp log [orders.view]
- `PATCH /admin/orders/:id/status {status, note}` [orders.update, or orders.kitchen for accepted/preparing/ready, orders.cancel for cancelled]
- `PATCH /admin/orders/:id/notes` [orders.update]
- `POST /admin/orders/quote` · `POST /admin/orders`: manual orders using website pricing [orders.create]
- `PUT /admin/orders/:id/assignment {staff_id|null}` [delivery.assign]
- `POST /admin/orders/:id/reconcile` [payments.view] · `POST /admin/orders/:id/refund {amount?, reason}` [payments.refund]

**Delivery**
- `GET/POST /admin/delivery/areas`, `PATCH/DELETE /admin/delivery/areas/:id` (with `slots[]`) [delivery.manage]
- `GET /admin/delivery/calendar`, `POST/DELETE /admin/delivery/holidays[/:id]`, `POST/DELETE /admin/delivery/special-hours[/:id]` [delivery.manage]
- `GET /admin/deliveries` · `GET /admin/deliveries/staff` [delivery.view / delivery.assign]
- `GET /admin/deliveries/mine` · `PATCH /admin/deliveries/:orderId {status: picked_up|out_for_delivery|delivered}` [delivery.update]

**Menu**
- `GET /admin/menu` [menu.view / menu.manage / menu.availability]
- `POST /admin/menu`, `PATCH /admin/menu/:id`, `DELETE /admin/menu/:id`, `PUT /admin/menu/order {ids}` [menu.manage]
- `PATCH /admin/menu/:id/availability {available, active?, featured?}` [menu.availability or menu.manage]
- `GET/POST /admin/categories`, `PATCH/DELETE /admin/categories/:id`, `PUT /admin/categories/order` [menu.manage]

**Customers, payments, promotions**
- `GET /admin/customers?q&status&segment&sort&dir&page` · `GET /admin/customers/:id` [customers.view] · `PATCH /admin/customers/:id` [customers.manage]
- `GET /admin/payments?status&provider&q&from&to&page` · `GET /admin/payments/:id` [payments.view]
- `GET/POST /admin/coupons`, `PATCH/DELETE /admin/coupons/:id` · `GET/POST /admin/offers`, `PATCH/DELETE /admin/offers/:id` [promotions.manage]

**Engagement & content**
- `GET /admin/reviews`, `PATCH/DELETE /admin/reviews/:id` [reviews.manage]
- `GET /admin/inquiries`, `PATCH /admin/inquiries/:id {status, reply}` [inquiries.manage]
- `GET /admin/notifications`, `POST /admin/notifications/read {ids?}` [notifications.view or orders.view]
- `GET /admin/notification-logs` [settings.manage or orders.update]
- `GET /admin/media`, `POST /admin/media` (multipart `file`, `title`, `category`), `PATCH/DELETE /admin/media/:id` [media.manage]
- `GET/POST /admin/inventory`, `PATCH/DELETE /admin/inventory/:id`, `POST /admin/inventory/:id/adjust {delta}` [inventory.manage]

**Reports**: `GET /admin/reports/:type?format=csv|xlsx&…filters`, where type is `orders | revenue | payments | customers | menu-sales | delivery`. Orders reports accept the same filters as the orders list; others accept `preset/from/to`.

**Administration**
- `GET/POST /admin/staff`, `PATCH/DELETE /admin/staff/:id` [staff.manage]
- `GET /admin/roles`, `PUT /admin/roles/:id/permissions {permissions}` [staff.manage; editing requires Super Admin]
- `GET /admin/audit?entity&admin_id&q&page` [audit.view]
- `GET /admin/settings` · `PATCH /admin/settings/restaurant|business|payments|notifications` [settings.manage]
