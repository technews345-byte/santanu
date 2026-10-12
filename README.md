<h1 align="center">R&amp;R Dev</h1>

<p align="center">
  <b>Santanu Bordoloi</b> · Full-stack and Android developer<br>
  Building web apps, mobile apps and automation tools that real businesses run on.
</p>

<p align="center">
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-22-339933?logo=nodedotjs&logoColor=white">
  <img alt="Express" src="https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white">
  <img alt="SQLite" src="https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white">
  <img alt="Kotlin" src="https://img.shields.io/badge/Kotlin-7F52FF?logo=kotlin&logoColor=white">
  <img alt="Jetpack Compose" src="https://img.shields.io/badge/Jetpack%20Compose-4285F4?logo=jetpackcompose&logoColor=white">
  <img alt="GitHub Actions" src="https://img.shields.io/badge/GitHub%20Actions-2088FF?logo=githubactions&logoColor=white">
  <img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-yellow.svg">
</p>

---

## About me

I'm an open-source developer who builds complete products, from the database and server to the website, the admin tools and the mobile app. I care about software that is secure, easy for staff to use and simple to deploy.

**What I work on**

- 🌐 **Web apps:** full-stack Node.js applications with admin dashboards
- 📱 **Android apps:** native Kotlin apps with Jetpack Compose
- ⚙️ **Automation:** CI/CD pipelines, automatic releases and business workflows
- 🤖 **AI tools and developer utilities:** productivity tools and open-source experiments

---

## Featured project: Bowl Mania

**A complete online ordering and delivery platform for a real restaurant.**

Bowl Mania is a healthy-bowl restaurant with kitchens in Sonari and Nazira (Assam, India). I designed and built its whole digital system: a customer website, a restaurant admin panel and an Android app for delivery riders. All three run on one Node.js server and one database.

| | |
|---|---|
| **Products** | Customer website · Admin panel · Rider Android app |
| **Code** | ~6,600 lines of JavaScript · ~4,300 lines of Kotlin |
| **Testing** | 22 end-to-end API tests · Android unit tests |
| **Hosting** | Railway (full system) · GitHub Pages (static website) |
| **Releases** | Every Android build is tested, signed and published automatically |

### 🛒 Customer website

- Live menu with sizes, prices and sold-out status straight from the database
- Delivery or pickup, with a **delivery charge calculated from the customer's location**. The nearest kitchen is chosen automatically.
- Coupons and offers, with **Razorpay online payment** or cash on delivery
- Order tracking, reviews and a contact form
- Features, About Us, Support & FAQ, Contact, Privacy Policy, Terms of Service and Delete Account pages
- **Tamper-proof checkout:** the browser sends only the items and quantities. The server works out every price, discount, fee and total, so customers can't change what they pay.

### 🧑‍🍳 Restaurant admin panel

- Dashboard, orders, deliveries, menu, categories and inventory
- Customers, reviews, inquiries, payments, coupons and offers
- Analytics, plus **CSV and Excel reports**
- **New orders appear instantly**, with a sound and a browser notification
- **Live rider map**, rider profiles with photos, attendance, shifts, support tickets and proof of delivery
- **Six staff roles** with separate permissions, and an audit log of every change
- **WhatsApp messages** to customers when their order status changes
- Works on phones as well as computers

### 🛵 Bowl Mania Rider (Android app)

- Riders go online, then accept or reject deliveries, even straight from the notification
- Step-by-step delivery with **pickup and delivery codes**, cash confirmation and **proof of delivery** (photo, signature and note)
- Google Maps navigation with distance and time estimates
- **Selfie and location check-in** for attendance, plus breaks, shifts and leave requests
- Performance stats, support tickets and **safety and emergency buttons**
- **Works with a weak signal:** location points are saved on the phone and uploaded later
- Location is shared only while the rider is online, through a visible notification

### 🔒 Engineering highlights

- **Security:** signed staff sessions (JWT), permission checks on every admin route, security headers, input validation and HTTPS-only app traffic
- **Database:** SQLite with versioned migrations, automatic starter data and a one-command backup
- **Real time:** Server-Sent Events push new orders to the admin panel
- **CI/CD:** GitHub Actions publishes the website to GitHub Pages, and builds, tests, signs and releases the Android app
- **Documentation:** setup and deployment guides plus a full [API reference](bowl-mania-site/docs/API.md)

---

## Repository structure

```
.
├── bowl-mania-site/     Website, admin panel and Node.js server
│   ├── src/             API routes, business logic and database migrations
│   ├── public/          Customer website and admin panel (plain HTML, CSS and JS)
│   ├── test/            End-to-end API tests
│   └── docs/API.md      API reference
├── rider-app/           Bowl Mania Rider Android app (Kotlin, Jetpack Compose)
└── .github/workflows/   GitHub Pages deployment and Android build and release
```

## Getting started

**Website and admin panel** (needs Node.js 22):

```bash
cd bowl-mania-site
npm install
cp .env.example .env    # set JWT_SECRET, ADMIN_EMAIL and ADMIN_PASSWORD
npm run dev             # website: http://localhost:3000   admin: http://localhost:3000/admin
npm test                # run the end-to-end tests
```

**Android app** (needs Android Studio and JDK 17):

```bash
cd rider-app
./gradlew testDebugUnitTest assembleDebug
```

Full guides: [website and admin](bowl-mania-site/README.md) · [rider app](rider-app/README.md)

---

## Tech stack

| Area | Tools |
|---|---|
| **Languages** | JavaScript, Kotlin, Python, SQL |
| **Back end** | Node.js, Express, SQLite, Zod, Helmet, JWT |
| **Front end** | HTML, CSS, JavaScript, React |
| **Android** | Jetpack Compose, Retrofit, Room, WorkManager, Google Maps, Firebase |
| **Integrations** | Razorpay, WhatsApp Cloud API, Nodemailer, ExcelJS, Sharp |
| **DevOps** | GitHub Actions, GitHub Pages, GitHub Releases, Railway |

---

## License

Released under the [MIT License](LICENSE). © 2026 R&R Dev
