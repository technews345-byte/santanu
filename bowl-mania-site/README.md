# Bowl Mania — Website & Restaurant Admin

*Fresh like a new morning.* The Bowl Mania customer website (Sonari & Nazira) and a full restaurant admin panel, backed by one Node.js server and one database. The database is the only source of truth for prices, availability, hours, delivery charges and order totals.

- **Website** (`/`): live menu with sizes and sold-out state, offers, delivery/pickup checkout with location-based delivery charge, coupons, Razorpay or cash, order tracking, reviews and a contact form.
- **Admin** (`/admin`): dashboard, orders, deliveries, menu, categories, inventory, customers, reviews, inquiries, payments, coupons, offers, analytics, reports (CSV/Excel), gallery & videos, notifications, delivery areas & hours, staff & roles, settings and audit log. It works on phones too.

---

## Quick start (local)

Requirements: **Node.js 20.12 or newer**.

```bash
cd bowl-mania-site
npm install
cp .env.example .env        # then edit: JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm run dev                 # http://localhost:3000   admin: http://localhost:3000/admin
```

On first start the server creates the database (`data/bowl-mania.db`), runs migrations and seeds:

- the six bowls and prices from the menu poster (Morning Glow, Bean Vitality, Grill Power, Chicken Crunch, Sprout, Super Protein);
- categories, the six staff roles and their permissions;
- the Sonari and Nazira delivery areas with the poster's timings and fees (₹10 for the first 1.5 km, +₹10 per extra 1.5 km);
- the first **Super Admin** from `ADMIN_EMAIL` / `ADMIN_PASSWORD` (only when no staff account exists yet).

> **Set the real kitchen locations.** The seed uses approximate town-centre coordinates for Sonari and Nazira. In **Admin → Delivery areas**, edit each area and enter the kitchen's exact latitude/longitude (or tap "Use my current location" while at the kitchen). Distances and delivery charges are calculated from these points.

| Command | What it does |
|---|---|
| `npm run dev` | Start with auto-restart on code changes |
| `npm start` | Start for production |
| `npm test` | Run the end-to-end API tests (Razorpay and WhatsApp are mocked) |
| `npm run create-admin -- you@example.com "Your Name"` | Create or reset a Super Admin from the command line |
| `npm run backup` | Write a consistent database backup to `backups/` (keeps the newest 30) |
| `npm run build` | Nothing to build: the front end is plain HTML/CSS/JS served as-is |

---

## How it fits together

```
server.js                 entry: migrate → seed → start
src/
  config.js               environment configuration (secrets only from .env)
  app.js                  Express app, security headers (CSP), routing, static files
  db/migrations/*.sql     schema, applied in order and recorded in schema_migrations
  db/seed.js              idempotent reference data
  services/               business logic: pricing, delivery, orders, payments, whatsapp, auth…
  routes/public.js        website API, Razorpay/WhatsApp webhooks, tracking
  routes/auth.js          staff sign-in, refresh, logout, forgot/reset password
  routes/admin/*.js       admin API (every route checks a permission)
public/                   website (index.html, script.js, styles.css, track.html)
public/admin/             admin single-page app (ES modules, no build step)
test/api.test.js          end-to-end tests
docs/API.md               API reference
```

**Checkout security.** The browser sends only item ids, size ids, quantities, the coupon code and the location. The server loads prices from the database, checks availability, validates the coupon and offers, calculates distance with the Haversine formula, picks the nearest kitchen that delivers there, applies the delivery fee, tax and minimum order, and stores the order. Any price, discount, fee or total sent by the browser is ignored.

**Order flow.** `new → confirmed → (accepted) → preparing → ready → out for delivery → delivered → completed`, plus `cancelled` and `refunded`. Pickup orders go `ready → completed`. Every change is written to `order_status_history`, logged in the audit log, pushed live to the admin, and (if enabled) sent to the customer on WhatsApp. Cash orders are marked paid when delivered or picked up.

**Real-time.** The admin keeps a Server-Sent Events connection (`/api/admin/events`). New orders appear instantly with a chime and, if allowed, a browser notification. No refresh needed.

---

## Staff roles

| Role | Can do |
|---|---|
| Super Admin | Everything, including managing other Super Admins and editing role permissions |
| Admin | Everything in the restaurant |
| Manager | Daily operations (not staff, settings, audit log or refunds) |
| Order Manager | View/confirm/update/cancel orders, manual orders, assign deliveries, sold-out toggles, inquiries |
| Kitchen Staff | View orders, move them to preparing/ready, sold-out toggles, inventory |
| Delivery Staff | See and update only their own deliveries (picked up → out for delivery → delivered) |

A Super Admin can change any role's permissions in **Admin → Staff & roles**.

---

## Razorpay setup

1. In the Razorpay Dashboard, open **Account & Settings → API Keys** and generate keys (start with **Test mode**).
2. Put them in `.env`: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`.
3. Open **Webhooks → Add new webhook**:
   - URL: `https://YOUR-DOMAIN/api/payments/webhook` (also shown in Admin → Settings)
   - Secret: any strong string; put the same value in `RAZORPAY_WEBHOOK_SECRET`
   - Events: `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`, `refund.failed`
4. Make sure **automatic capture** is on for payments (Razorpay's default for Orders).
5. Restart the server. **Admin → Settings → Connections** should show Razorpay as connected.

How payments are confirmed: the website opens Razorpay Checkout for a server-created Razorpay order. After payment the server verifies the signature (`HMAC_SHA256(order_id|payment_id, key_secret)`) and checks the amount. The signed webhook confirms the same payment again, which covers customers who close the browser. Webhooks are stored by event id, so retries are processed once. Staff can press **Check with Razorpay** on an order to reconcile, and can refund from the order page.

Switch to live keys (`rzp_live_…`) once test payments work end to end.

## WhatsApp Business Cloud API setup

1. In **Meta for Developers**, create an app with the **WhatsApp** product and add your business phone number.
2. From **WhatsApp → API Setup**, copy the **Phone number ID** and create a **permanent access token** (System User in Business Settings).
3. Put them in `.env`: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, plus `WHATSAPP_APP_SECRET` (App settings → Basic) and a `WHATSAPP_VERIFY_TOKEN` of your choice.
4. In **WhatsApp → Configuration → Webhook**, set the callback URL to `https://YOUR-DOMAIN/api/whatsapp/webhook`, the verify token to your `WHATSAPP_VERIFY_TOKEN`, and subscribe to **messages** (for delivery receipts).
5. In **Admin → Settings → WhatsApp messages**, turn messages on and edit the texts.

WhatsApp only lets businesses send free-form text to customers who messaged you in the last 24 hours. For other customers you need **approved message templates**: create them in WhatsApp Manager with body variables `{{1}}, {{2}}…` in the same order as the placeholders in your admin text, then enter the template name next to each message. Every send and its delivery status appears in the order's history and in **Settings → View message log**.

## Password reset emails (optional)

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `SMTP_FROM`. Without email configured, a Super Admin can reset anyone's password in **Staff & roles**, or use `npm run create-admin`.

---

## Deploying to production

Any Linux server or VPS with Node.js 20+ works (for example a small DigitalOcean, AWS Lightsail or Hetzner instance).

1. **Copy the code** and install: `npm ci --omit=dev`.
2. **Create `.env`** from `.env.example` with `NODE_ENV=production`, your `PUBLIC_URL`, a long random `JWT_SECRET`, `TRUST_PROXY=1`, and the Razorpay/WhatsApp keys. In production the server refuses to start without `JWT_SECRET`.
3. **Keep data outside the code folder** (recommended): set `DATABASE_FILE`, `UPLOADS_DIR` and `BACKUP_DIR` to, e.g., `/var/lib/bowlmania/…`.
4. **Run it as a service** (systemd example):

   ```ini
   # /etc/systemd/system/bowlmania.service
   [Service]
   WorkingDirectory=/opt/bowlmania/bowl-mania-site
   ExecStart=/usr/bin/node --env-file=.env server.js
   Restart=always
   User=bowlmania
   Environment=NODE_ENV=production
   [Install]
   WantedBy=multi-user.target
   ```

5. **Put HTTPS in front** with Nginx or Caddy. Caddy is the simplest option:

   ```
   bowlmania.example.com {
     reverse_proxy 127.0.0.1:3000
   }
   ```

   With Nginx, keep Server-Sent Events working by adding `proxy_buffering off;` and `proxy_read_timeout 1h;` for `/api/admin/events`.
6. **Back up daily**: `0 3 * * * cd /opt/bowlmania/bowl-mania-site && npm run backup`, and copy the `backups/` folder and `uploads/` off the server (e.g. to cloud storage). Restoring is copying a backup file back to `DATABASE_FILE` while the service is stopped.
7. Sign in at `/admin` and change the first admin's password in **Account**.

This setup runs one server process with SQLite, which suits a restaurant with a few locations. The rate limiter and live-event hub are in-memory, so run a single instance. Moving to several instances would need a shared store (e.g. Redis) and a server database (e.g. PostgreSQL).

---

## Security summary

- Staff passwords are hashed with scrypt; sign-in is rate-limited and has constant-time checks.
- Short-lived access token plus rotating refresh session, both in `httpOnly`, `SameSite=Strict` cookies (`Secure` in production). Double-submit CSRF token on every admin change.
- Every admin endpoint checks a permission on the server; disabled staff are signed out immediately.
- Input is validated with zod; all SQL uses bound parameters; the admin and website escape all dynamic text.
- Helmet security headers with a Content Security Policy (only Razorpay and Google Fonts are allowed as outside sources).
- Razorpay signatures and WhatsApp webhooks are verified with HMAC; webhooks are idempotent.
- Secrets live only in `.env` and are never sent to the browser. Admin → Settings only shows whether a key is set.
- Tracking links use a random 32-character token and show no phone number or address.
- Every admin change is recorded in the audit log with the person, time, IP, and before/after values.

## Testing

`npm test` starts the app against a temporary database with mock Razorpay and WhatsApp servers. It checks seeded prices, Haversine delivery fees, sign-in/CSRF/refresh, role permissions, menu changes reaching the website, client-sent totals being ignored, coupon limits, automatic offers, Razorpay order creation, signature verification, forged signatures, duplicate webhooks, WhatsApp sending and delivery receipts, refunds, failed payments, delivery staff flow, COD settlement, reviews, manual orders, dashboard/analytics, CSV/Excel exports, closing the restaurant, the contact form, live events, image optimisation, password reset and logout.

The admin (all 24 screens) and the customer ordering journey were also exercised in a real browser at desktop and phone sizes.

## Known limits

- Delivery distance is a straight line (Haversine). Road distance is usually 20–40% longer, so set each area's radius with that in mind.
- Add-ons/extras per bowl are not modelled yet; customers can write them in the kitchen notes.
- Online payment and WhatsApp need your own Razorpay and Meta accounts; they are tested here against mock servers that follow the real APIs.
