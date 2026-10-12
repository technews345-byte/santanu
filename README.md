# Hi, I'm Santanu Bordoloi — R&R Dev

Open-source developer focused on:
- AI tools
- Automation
- Web apps
- Developer utilities

## Project achievements

### Bowl Mania: a complete restaurant ordering and delivery platform

I designed and built the full digital system for **Bowl Mania**, a healthy-bowl restaurant with kitchens in Sonari and Nazira. It has three parts: a customer website, a restaurant admin panel and an Android app for delivery riders.

**At a glance**

- Three connected products (website, admin panel, rider app) running on **one Node.js server and one database**
- About **6,600 lines of JavaScript** (server, website and admin) and **4,300 lines of Kotlin** (Android app)
- **22 end-to-end API tests**, plus unit tests for the Android app
- Live in production on **Railway**, with a static copy of the website on **GitHub Pages**
- Every Android build is tested and published automatically as a **GitHub Release** with a stable download link

#### 1. Customer website — [`bowl-mania-site/`](bowl-mania-site/)

- Live menu with sizes, prices and sold-out status loaded from the database
- Delivery or pickup checkout with a **delivery charge based on the customer's location** (Haversine distance, nearest kitchen chosen automatically)
- Coupons, offers, **Razorpay online payments** or cash on delivery
- Order tracking page, reviews and contact form
- Full set of information pages: Features, About Us, Support & FAQ, Contact, Privacy Policy, Terms of Service and Delete Account
- **Tamper-proof checkout:** the browser sends only items and quantities. The server calculates every price, discount, fee and total, so customers can't change what they pay.

#### 2. Restaurant admin panel — `/admin`

A single-page app with no build step that also works on phones. It covers:

- Dashboard, orders, deliveries, menu, categories and inventory
- Customers, reviews, inquiries, payments, coupons and offers
- Analytics and **CSV/Excel reports**
- Gallery and videos, notifications, delivery areas and opening hours
- **Live rider map** (OpenStreetMap), rider profiles with photos, attendance and shifts, rider support tickets and proof of delivery
- **Real-time new-order alerts** over Server-Sent Events, with a sound and a browser notification, so staff never need to refresh
- **Six staff roles** (Super Admin, Admin, Manager, Order Manager, Kitchen Staff, Delivery Staff). Every route checks a permission, and every change is recorded in an audit log.
- **WhatsApp order updates** sent to customers at each status change

#### 3. Bowl Mania Rider Android app — [`rider-app/`](rider-app/)

A native Android app in **Kotlin and Jetpack Compose** for delivery staff:

- Go online or offline, then accept or reject deliveries, including straight from the notification
- Step-by-step delivery flow with **pickup and delivery codes**, cash confirmation for cash-on-delivery orders, and **proof of delivery** (photo, signature and note)
- Google Maps navigation and estimates of distance and time
- **Selfie and location check-in** for attendance, plus breaks, shifts and leave requests
- Performance stats, support tickets, and **safety and emergency buttons**
- **Works offline:** location points are queued and uploaded later, and screens show the last saved data
- Location is shared only through a visible foreground service, and only while the rider is online
- Encrypted session storage, a Room database cache, background sync with WorkManager and Firebase push notifications

#### Engineering highlights

- **Security:** JWT staff sessions, role-based access control, Content Security Policy headers via Helmet, input validation with Zod and HTTPS-only app traffic
- **Database:** SQLite with versioned migrations, data seeded automatically, and a one-command backup script
- **CI/CD:** GitHub Actions deploys the website to GitHub Pages, and builds, tests, signs and releases the Android APK
- **Documentation:** a full setup guide, deployment guide and [API reference](bowl-mania-site/docs/API.md)

**Built with:** Node.js 22, Express 5, SQLite (better-sqlite3), Zod, Helmet, Sharp, ExcelJS, Nodemailer, Razorpay, WhatsApp Cloud API, Kotlin, Jetpack Compose, Retrofit, Room, WorkManager, Google Maps, Firebase, GitHub Actions and Railway.

## Current Projects
- Bowl Mania restaurant platform (website, admin panel and rider app)
- AI automation tools
- Productivity utilities
- Open-source experiments

## Tech Stack
- JavaScript
- Python
- Node.js
- React
- Kotlin and Jetpack Compose (Android)
- SQLite
- GitHub Actions

## GitHub Stats
Active open-source contributor and maintainer.
