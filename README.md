# Encore Cinemas

A cinema ticket booking system: a React/Vite/TypeScript client, a Node.js/Express/MongoDB API, real-time seat availability over Socket.IO, real Stripe payments, and email (nodemailer) + SMS (notify.lk) notifications.

The full requirements, architecture decisions, and test strategy live in [`docs/encore-cinema-PID-SRS.md`](docs/encore-cinema-PID-SRS.md). This README is the practical setup path — per NFR-8, the stack does not start without configuration, so treat this as mandatory reading before your first run, not optional.

## Contents

- [Prerequisites](#prerequisites)
- [1. Get a database](#1-get-a-database)
- [2. Configure the server](#2-configure-the-server)
- [3. Configure the client](#3-configure-the-client)
- [4. Install dependencies](#4-install-dependencies)
- [5. Seed the database](#5-seed-the-database)
- [6. Verify your account](#6-verify-your-account)
- [7. Run it](#7-run-it)
- [8. How payment confirmation works](#8-how-payment-confirmation-works)
- [Docker Compose (containerised alternative)](#docker-compose-containerised-alternative)
- [Troubleshooting](#troubleshooting)
- [Scripts reference](#scripts-reference)

## Prerequisites

- **Node.js 22** (both `client/` and `server/` target Node 22; the server Dockerfile is `node:22-alpine`).
- **A MongoDB connection** — either a free MongoDB Atlas cluster, or the bundled `local-mongo` Docker Compose profile if you don't have Atlas access (see [§1](#1-get-a-database)).
- **Docker + Docker Compose** — optional, only needed for the containerised path.
- Accounts you'll want in test/sandbox mode: **Stripe** (test-mode publishable + secret key), an **SMTP** provider (or skip — see below), and **notify.lk** (optional — `NotifyDEMO` works for testing).

Note what's *not* on this list: there's no Stripe CLI and no webhook forwarding step. Payment confirmation is pulled by the server, not pushed by Stripe — see [§8](#8-how-payment-confirmation-works).

## 1. Get a database

**Option A — MongoDB Atlas (recommended):**

1. Create a free cluster at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas).
2. Create a database user (username + password) scoped to that cluster.
3. Under Network Access, allow your current IP (or `0.0.0.0/0` for a quick local demo — tighten this before sharing the cluster).
4. Copy the connection string from "Connect → Drivers" — it looks like `mongodb+srv://<username>:<password>@<cluster>.mongodb.net/encore_dev?retryWrites=true&w=majority`.

**Option B — no Atlas access (offline fallback, R11):** run the bundled `local-mongo` Docker Compose profile instead — no Atlas account needed. See [Docker Compose](#docker-compose-containerised-alternative) below. If you're running the server outside Docker but want a local Mongo, start just that service:

```bash
docker compose --profile local-db up local-mongo -d
```

and point `MONGODB_URI` (below) at `mongodb://localhost:27017/encore_dev`.

## 2. Configure the server

```bash
cp server/.env.example server/.env
```

Open `server/.env` and fill in:

| Variable | Where to get it | Required to boot? |
|---|---|---|
| `MONGODB_URI` | §1 above | **Yes** |
| `JWT_SECRET` | Any long random string (`openssl rand -hex 32`) | **Yes** |
| `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` | [Stripe Dashboard → Developers → API keys](https://dashboard.stripe.com/test/apikeys) (test mode) | **Yes** — creating a PaymentIntent and the server's own confirmation step (§8) both call Stripe directly with the secret key |
| `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS` | Your provider, or **leave blank** | No — an Ethereal test account is created automatically in development, and its preview URL is logged to the console on every send (see [§6](#6-verify-your-account)) |
| `NOTIFYLK_USER_ID`, `NOTIFYLK_API_KEY` | [notify.lk](https://notify.lk) account | No — leave blank or set `SMS_ENABLED=false`; SMS sends are logged and skipped, never fail a request |
| `HOLD_TTL_MINUTES` | Default `10` is fine | No |
| everything else | Defaults in `.env.example` are sensible for local dev | No |

## 3. Configure the client

```bash
cp client/.env.example client/.env
```

Fill in `VITE_STRIPE_PUBLISHABLE_KEY` with the **same publishable key** you used for the server (never the secret key — anything in the client bundle is public). `VITE_API_URL` and `VITE_SOCKET_URL` can stay as shipped; the Vite dev server proxies `/api` and `/socket.io` to `localhost:5000` so the browser only ever talks to one origin.

> **Gotcha:** Vite only inlines `VITE_`-prefixed variables that are present in the environment when the build/dev process actually starts. Running `npm run dev:client` reads `client/.env` automatically (Vite does this for you), so the step above is all local dev needs. **Docker Compose is different** — `docker compose up --build` never reads `client/.env`; `docker-compose.yml` passes `VITE_STRIPE_PUBLISHABLE_KEY` into the client image as a build arg, interpolated from `${VITE_STRIPE_PUBLISHABLE_KEY}` in *your shell environment* (or a `.env` file at the **repo root**, which Compose loads automatically — a different file from `client/.env`). If you only set the key inside `client/.env` and then run the containerised path, the image bakes in an empty key and Stripe Elements silently fails to mount. Before building, either `export VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...` in the shell you run `docker compose` from, or add that line to a root-level `.env`.

## 4. Install dependencies

```bash
npm install --prefix server
npm install --prefix client
```

## 5. Seed the database

```bash
npm run seed
```

(root `package.json` forwards this to `npm --prefix server run seed`, i.e. `node server/src/scripts/seed.js`). This is idempotent — safe to re-run — and creates:

- **2 cinemas**, with **3 screens** between them (each screen has its own seat layout).
- **5 films**, each with several **showtimes** — **12 showtimes** in total across the two cinemas.
- **1 admin account** — `admin@encore.live` / `Admin123!`
- **3 pre-verified customer accounts** — `miriam.osei@example.com`, `theo.blackwell@example.com`, `priya.nair@example.com`, all with password `Password123!`. These can book immediately.
- **1 deliberately-unverified customer account** — `noor.fernando@example.com` / `Password123!`. It exists to exercise the "must verify before booking" gate: log in with it and try to book before verifying (§6) to see the block, then verify it and try again.

Use the admin login to reach `/admin`; use a pre-verified customer login (or register your own and verify it — [§6](#6-verify-your-account)) to book a showtime.

## 6. Verify your account

A freshly registered account can log in but can't book — the API sends a verification email with a signed, single-use link, and the booking endpoint refuses to create a hold for an unverified account. This is the same gate the seeded unverified customer (§5) exists to demonstrate.

There's no real mailbox in local development. When `SMTP_HOST` is left blank (the default), the server creates a throwaway [Ethereal](https://ethereal.email) account on startup and sends verification (and password-reset) mail through it instead of a real provider. Ethereal never delivers anywhere — it just captures the message and hands back a preview URL.

To verify an account locally:

1. Register a new account, or use the seeded unverified customer (§5).
2. Watch the terminal running `npm run dev:server`. Every send logs a line like:
   ```
   [Email] Preview URL: https://ethereal.email/message/XXXXXXXXXXXXXXXXXXXXX
   ```
   (If the server also exposes a dev-only endpoint that returns the latest preview URL, that works too — the console log is the path that's always available, so it's the one to rely on.)
3. Open that URL in a browser. It renders the exact email that would have been sent in production, verification link included — click the link to verify the account.

## 7. Run it

Two terminals:

```bash
# Terminal 1 — API (http://localhost:5000)
npm run dev:server

# Terminal 2 — client (http://localhost:5173)
npm run dev:client
```

Open `http://localhost:5173`, log in (or register and verify — §6), pick a showtime, select seats, and pay with Stripe's universal test card **`4242 4242 4242 4242`**, any future expiry, any CVC, any postcode. See [§8](#8-how-payment-confirmation-works) for what happens next — there's no webhook involved.

## 8. How payment confirmation works

Booking confirmation used to be webhook-driven: Stripe would call an `/api/payments/webhook` endpoint when a payment succeeded, and the server trusted that callback directly. That endpoint had no signing-secret verification configured, which meant anyone who could reach it could POST a forged "payment succeeded" event and get a booking confirmed without paying anything. Rather than bolt signature verification onto that endpoint, it has been removed from the codebase entirely — the server no longer accepts any inbound payment notification from anyone (ADR-014).

Instead, confirmation is **pulled** by the server on its own initiative, never pushed by Stripe:

1. The client creates a **Hold** on the selected seats for a showtime — no payment yet, just a time-limited reservation (`HOLD_TTL_MINUTES`).
2. The client asks the server to create a Stripe **PaymentIntent** tied to that hold.
3. The client confirms the payment with **Stripe.js**, entering card details into Stripe's hosted iframe — they never touch the Encore client or server.
4. The client calls `POST /api/bookings/confirm` with `{ holdId }` and nothing else — no amount, no payment status, no card details.
5. The server looks up the PaymentIntent for that hold and retrieves its status **directly from Stripe's API**, using `STRIPE_SECRET_KEY`. It never trusts anything the client claims about the payment; amount, currency, and status are all re-checked server-side before anything is created.
6. If the retrieved status is `succeeded`, the server creates the **Booking** and releases the hold.

A background **reconciliation job** runs on an interval (every couple of minutes) independently of any client request. It scans for PaymentIntents that succeeded but whose hold was never confirmed — the classic case is a customer who pays, then closes the tab before step 4 completes — and finishes the booking on their behalf. This is what makes removing the webhook safe: nothing is lost by not having a push notification, because the server periodically pulls the truth from Stripe anyway.

The trade-off is that confirmation can lag by up to the reconciliation interval if the client never calls confirm itself. That's an accepted cost for eliminating an unauthenticated inbound endpoint — full reasoning in ADR-014.

## Docker Compose (containerised alternative)

```bash
docker compose up --build
```

This builds and runs the `server` and `client` services (client served by nginx on `http://localhost:8080`, proxying `/api` and `/socket.io` to the server container). `server/.env` is loaded via `env_file`, so **no secret is duplicated into `docker-compose.yml`** — fill it in exactly as in §2 first. Remember the `VITE_STRIPE_PUBLISHABLE_KEY` gotcha from §3: export it in your shell (or set it in a root-level `.env`) before running `--build`, since `client/.env` isn't read by Compose.

No Atlas access? Run the bundled local Mongo profile alongside the stack:

```bash
docker compose --profile local-db up --build
```

and set `server/.env`'s `MONGODB_URI` to `mongodb://local-mongo:27017/encore_dev` beforehand.

## Troubleshooting

**My booking is stuck on "Confirming payment…" / stays `pending` forever, even though Stripe shows the payment succeeded.**
There's no webhook to fail to deliver here (§8) — confirmation is pulled, not pushed. Check, in order:
1. Did the client actually call `POST /api/bookings/confirm` with the hold's id? Check the browser's network tab and the server logs.
2. Is `STRIPE_SECRET_KEY` in `server/.env` valid, and for the **same** Stripe account/mode as `STRIPE_PUBLISHABLE_KEY`? Retrieving a PaymentIntent created under a different key/account returns "not found", not success.
3. If neither explains it, wait for the reconciliation job (runs every couple of minutes, §8) — it picks up any succeeded PaymentIntent with no confirmed booking and completes it automatically.

**Seat holds keep expiring while I'm still testing.**
`HOLD_TTL_MINUTES` (default 10) governs how long a `pending` booking's seats stay `held` before the background reaper releases them. Raise it in `server/.env` for a longer testing session, or re-issue a fresh checkout via the showtime page.

**Email/SMS aren't arriving.**
Expected if you left `SMTP_HOST`/`NOTIFYLK_*` blank — check the server console for an Ethereal preview URL (email, including the verification email — see §6) or a `[SMS] Disabled — skipping send` log line. Neither is required to complete a booking; notifications are best-effort by design (ADR-010) and never block or fail a request.

**`docker compose up` can't reach MongoDB.**
Confirm `MONGODB_URI` in `server/.env` is reachable from inside a container — `localhost` inside the `server` container is the container itself, not your host machine. Use `mongodb://local-mongo:27017/...` for the bundled profile, or your Atlas SRV string (which resolves over the internet regardless of container networking).

## Scripts reference

Convenience scripts live in the root `package.json` (deliberately **not** npm workspaces — see its `description` field for why) and simply forward to `npm --prefix`:

| Command | Effect |
|---|---|
| `npm run dev:server` | `server/`'s dev server (`node --watch`) |
| `npm run dev:client` | `client/`'s Vite dev server |
| `npm run seed` | Populate fixture data (§5) |
| `npm test` | Server + client test suites |
| `npm run lint` | ESLint on both sides |
| `npm run typecheck` | `tsc --noEmit` on the client |
| `npm run build` | Production client bundle |
