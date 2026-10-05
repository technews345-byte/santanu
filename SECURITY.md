# Security

Audit of this repository (Bowl Mania website and server, Bowl Mania Rider app, Prabhat app), with what was
checked, what was fixed, and what the owner still needs to do when deploying.

To report a vulnerability, email the repository owner rather than opening a public issue.

## What runs where

| Part | Exposure | Notes |
|---|---|---|
| `bowl-mania-site/` | Public website + API + admin panel (Node.js, Express, SQLite) | The main attack surface. |
| `rider-app/` | Android app for delivery staff | Talks only to the server's `/api/rider` over HTTPS with a bearer token. |
| `prabhat-app/` | Android app, fully offline | No internet permission, no accounts, no API keys. Data stays on the phone. |

## Checklist

| Area | Status |
|---|---|
| **API keys hidden** | No keys in the code or anywhere in the git history (all commits scanned). Server keys (Razorpay, WhatsApp, SMTP, Firebase) come only from environment variables. Android keys (Maps, Firebase) are injected at build time from GitHub secrets. |
| **Environment variables** | `bowl-mania-site/.env.example` documents every variable. Production refuses to start without required settings, and rejects a `JWT_SECRET` shorter than 32 characters. **Fixed:** a deploy without `NODE_ENV` (e.g. Railway) used to run in development mode with a publicly known fallback JWT secret, which would have let anyone forge an admin sign-in. Railway is now always treated as production, and there is no built-in secret any more: if `JWT_SECRET` is unset, a random one is generated and kept next to the database. |
| **Admin routes protected** | Every `/api/admin` route requires a valid session **and** a CSRF token. Each route also checks a specific permission (role-based); the four without a route-level check verify permissions inside the handler. |
| **Authentication** | Short-lived (15 min) signed access cookie + rotating refresh token. Cookies are `HttpOnly`, `SameSite=Strict`, `Secure` in production. Sessions can be revoked, and changing or resetting a password signs out every device. Password reset links are single-use, expire in 1 hour and are stored only as hashes. **Fixed:** the token algorithm is pinned to HS256; a rider-app token can no longer be used as a web-admin refresh token. |
| **Access control** | Roles and permissions in the database. Private files (delivery proof, selfies, rider photos) live outside the public folder and are served only to staff with the matching permission. File names are strictly validated (no path traversal). |
| **Form sanitising** | Every request body, query and parameter is validated with zod schemas (types, lengths, ranges, formats). Sort columns are fixed lists. All SQL uses placeholders, so no SQL injection was found. Uploaded images are re-encoded (which strips any hidden payload), and videos are checked by their file signature. CSV exports neutralise spreadsheet formulas. |
| **XSS** | The admin panel, website and tracking page escape all user text before inserting HTML. The Content Security Policy allows scripts only from the site itself (and Razorpay checkout), so injected inline scripts cannot run. |
| **Rate limiting** | Sign-in (per IP + email, and **new:** per account across all IPs), password reset, orders, contact forms and tracking were already limited. **New:** coupon checks (stops guessing codes), price quotes, payments, and an overall per-IP ceiling for the whole API. Payment webhooks are exempt so providers are never blocked. |
| **API endpoints** | Webhooks verify Razorpay / Meta signatures on the raw body. Prices, fees and discounts are always calculated on the server. Order tracking needs an unguessable token (or order number + phone). |
| **CORS** | No CORS headers are sent, so browsers block other websites from reading the API. This is the strictest setting, and the right one: the site and API share one origin, and the rider app is a native app. |
| **Security headers** | Helmet: Content-Security-Policy, HSTS (production), X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Cross-Origin-Resource-Policy; `X-Powered-By` removed. **New:** Permissions-Policy (camera, microphone and similar features off), and `Cache-Control: no-store` on every signed-in API response. |
| **Debug mode off** | Errors return a generic message (no stack traces). Development-only behaviour (reset links in logs, insecure cookies) is off in production, and production is now detected on Railway even without `NODE_ENV`. |
| **Dependencies** | `npm audit`: **0 vulnerabilities**. Fixed a moderate advisory in `uuid` (pulled in by `exceljs`) with an override. Updated `nodemailer` and `sharp`. `better-sqlite3` 13 is a major version: upgrade separately and run the tests. |
| **Unused packages** | None: every dependency is used. |
| **Exposed files** | Only `public/` and public `uploads/` are served. Source, `.env`, the database, backups and private files are not, and hidden dotfiles are ignored. A test checks this. |
| **Database** | Parameterised queries only, foreign keys on. **New:** the database and backups are readable only by the app's own user (mode 600, folders 700). Keep `DATABASE_FILE` / the Railway volume and `BACKUP_DIR` off any public path. |
| **Password hashing** | scrypt with a random salt per password; plain passwords are never stored or logged; timing-safe comparison; equal timing for unknown emails. **Stronger:** new hashes use cost equivalent to OWASP's recommendation (N=65536, r=8, p=2), and older hashes are upgraded automatically at the next sign-in. Broken stored hashes fail safely. |
| **Leaked secrets in git** | Full history scanned: none found (only placeholder values in `.env.example`). `prabhat-app/signing/prabhat-test.keystore` is a deliberate, non-secret test signing key, documented in `prabhat-app/README.md`. **New:** the *Security* workflow rescans the whole history on every push, blocks committed `.env`/key/database files, runs `npm audit` and the server tests, and repeats weekly. A root `.gitignore` keeps secrets out. |

Tests: `cd bowl-mania-site && npm test` (25 tests, including headers, forged tokens, exposed files, password
hashing and coupon brute-force limits).

## Owner checklist when deploying

1. Set `NODE_ENV=production`, and set `JWT_SECRET` to 48+ random characters (see `.env.example`).
2. Set a strong `ADMIN_PASSWORD` for the first sign-in, then change it in the admin panel.
3. Put Razorpay, WhatsApp, SMTP and Firebase values only in the host's environment settings, never in files.
4. Attach a persistent volume on Railway (database, uploads, private files), and keep backups private.
5. Restrict the Google Maps key to the rider app's package name and signing SHA-1.
6. Before publishing Prabhat on the Play Store, sign it with your own key (`PRABHAT_KEYSTORE_*` secrets).
7. If a secret was ever shared or pasted anywhere public, rotate it at the provider.
