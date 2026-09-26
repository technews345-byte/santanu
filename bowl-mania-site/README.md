# Bowl Mania — Website

*Fresh like a new morning.* A responsive website for Bowl Mania (Sonari & Nazira) with an online menu, order bag, WhatsApp ordering, and an admin order dashboard. Built with Express and SQLite.

## Features
- Brand-matched design (logo greens, sun yellow and earthy brown) that works on phones and desktops
- A real photo for each bowl, veg/non-veg markers, a size picker with live prices, and menu filters
- Order bag with quantities, delivery details and totals
  - **Place order** saves the order to the database
  - **Send order on WhatsApp** opens WhatsApp with the whole order typed out, sent to the Sonari or Nazira number
- If the site runs without the Node server (static hosting), ordering falls back to WhatsApp automatically
- Admin dashboard at `/admin` with stats, status filters, search, click-to-call/WhatsApp and status updates
- SEO: meta description, Open Graph tags and Restaurant structured data

## Run locally
1. Install Node.js 20.12+.
2. Copy `.env.example` to `.env` and set a strong `ADMIN_PASSWORD` and `JWT_SECRET`.
3. `npm install`
4. `npm start` (the script loads `.env` for you)
5. Open http://localhost:3000. The admin page is at http://localhost:3000/admin.

## Project layout
```
server.js            Express API + SQLite (menu, orders, contact, admin)
public/index.html    Website
public/styles.css    Website styles
public/script.js     Menu, order bag, checkout
public/admin.*       Admin dashboard
public/assets/       Logo, videos, poster, bowls/ (one photo per bowl)
```

## Going live
Use HTTPS, a strong admin password and JWT secret, and regular backups of `bowl-mania.db`.
The site charges a ₹10 base delivery fee online. For longer distances, confirm the final fee with the customer (₹10 for every additional 1.5 km).
