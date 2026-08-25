# Project Initiation Document

## Encore Cinemas — Cinema Ticket Booking System

**Module:** PUSL3120 Full-Stack Development
**Deliverable:** Full-Stack Project (100% coursework)
**Document type:** Project Initiation Document with embedded Software Requirements Specification (SRS) and Architecture Decision Records (ADRs)
**Author:** Dilmi Manodya
**Version:** 3.3
**Date:** 2026-08-23

---

## Document control

| Field | Detail |
|---|---|
| Status | Baselined for development |
| Repository | [GitHub Classroom link — insert] |
| Related documents | Encore Design System v1.0; Frontend Build Specification v1.0 |
| Review cycle | Updated at each sprint boundary |

**Revision history**

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-08-23 | Dilmi Manodya | Baselined after requirements review |
| 2.0 | 2026-08-23 | Dilmi Manodya | Added ADRs, API contracts, data flow, scale estimates, error handling, expanded test strategy |
| 2.1 | 2026-08-23 | Dilmi Manodya | Switched persistence to MongoDB Atlas (ADR-007) |
| 2.2 | 2026-08-23 | Dilmi Manodya | Fixed language split — TypeScript client, JavaScript server (ADR-008) |
| 3.0 | 2026-08-23 | Dilmi Manodya | **Domain changed from live concerts to cinema. Added Stripe payments (ADR-009), Nodemailer + Notify.lk notifications (ADR-010), production-grade auth with email verification and password reset (ADR-011). ADR-004 superseded by ADR-012 (TTL seat hold) as payment latency invalidates the previous concurrency model.** |
| 3.1 | 2026-08-23 | Dilmi Manodya | Added Redis for shared ephemeral state and catalogue caching (ADR-013, supersedes ADR-006); closes the FR-15 session-invalidation gap that stateless JWT could not deliver |
| 3.2 | 2026-08-23 | Dilmi Manodya | Payment confirmation switched from webhooks to server-side PaymentIntent retrieval (ADR-014, supersedes ADR-009); reconciliation promoted from backstop to core requirement |
| **3.3** | 2026-08-23 | Dilmi Manodya | **Cinema-migration SRS amendments: catalogue entity renamed to Film throughout (see glossary, §C1.3); ADR-013 revised to "Option D" — MongoDB TTL collections (`revokedtokens`, `ratelimits`) replace Redis entirely, dropping catalogue caching and the compliance risk (R20–R22 retired, replaced by two Option-D-specific risks); Hold promoted to its own collection (no TTL index — the reconciliation record must survive expiry); seat tiers (STANDARD/PREMIUM/RECLINER) formalised in the glossary and data model; `POST /api/holds` split from `POST /api/holds/:id/payment-intent`; registration now returns 202 with no token; dev-only `GET /api/dev/last-mail` added; socket events renamed to the showtime domain and `booking:updated` added; corrected a dozen cross-reference and count errors (ADR citations, invalid compound index, seat-cap figures, e2e journey numbering).** |

**Contents**

- **Part A — Project Initiation Document** (§A1–A13)
- **Part B — Architecture Decision Records** (ADR-001 to ADR-014)
- **Part C — Software Requirements Specification** (§C1–C9)
- **Part D — Test Strategy and Plan** (§D1–D8)
- **Appendix** — coursework requirement checklist

---

# Part A — Project Initiation Document

## A1. Executive summary

Encore Cinemas is a distributed, full-stack web application for booking cinema tickets. Customers browse films now showing, choose a showtime at a nearby cinema, select seats on a live auditorium seat map, pay securely by card, and receive confirmation by email and SMS. Administrators manage films, cinemas, screens, showtimes, and bookings.

The system is built with a React/TypeScript client, a Node.js/Express (JavaScript) backend, and MongoDB Atlas. WebSockets keep seat availability synchronised across all clients viewing a showtime. Payments are processed by **Stripe**, confirmed by server-side retrieval, transactional email is sent via **Nodemailer**, and SMS notifications are delivered through **Notify.lk**. Authentication follows production practice: email verification at registration, secure password reset, hashed single-use tokens, and rate-limited endpoints.

The project is delivered by a single developer over 80+ hours using an iterative, sprint-based process with a CI/CD pipeline. This document establishes the business case, scope, objectives, technical approach, plan, and risk position; embeds fourteen Architecture Decision Records (Part B); baselines system behaviour in a full SRS (Part C); and defines verification in a Test Strategy (Part D).

## A2. Background and business case

Small and mid-size cinema chains frequently operate booking through counter sales, phone reservations, or generic third-party listings that do not reflect live seat availability. The result is double-booking, queueing at the counter, and no reliable record of a customer's booking once they leave.

Encore Cinemas addresses this with a purpose-built platform where seat state is authoritative and instantly consistent across every device, payment is captured before the seat is confirmed, and the customer holds a durable record delivered to both their inbox and their phone.

**Benefits over existing arrangements:**

- **For customers:** live seat availability with no risk of arriving to a taken seat; seat choice rather than allocation at the counter; card payment without queueing; confirmation by email *and* SMS, so the booking reference survives a lost signal or a flat battery; a self-service booking history and cancellation.
- **For cinema administrators:** one dashboard for films, screens, showtimes, and bookings, replacing spreadsheets; live occupancy per showtime; automatic notification of customers when a showtime is cancelled.
- **For the operator:** fewer counter disputes, fewer no-shows through SMS reminders, and payment reconciled automatically through the gateway rather than manually.

## A3. Project objectives and success criteria

| # | Objective | Success criterion (measurable) |
|---|---|---|
| O1 | Deliver a working distributed full-stack system | Client and API run as separate containers via `docker-compose`; data tier on managed MongoDB Atlas — three independently hosted tiers |
| O2 | Real-time multi-client behaviour | A seat held or booked on one client updates on all others within 1s (p95) via WebSocket |
| O3 | Production-grade authentication | Email verification required before booking; password reset via hashed single-use token; bcrypt hashing; rate-limited auth endpoints; zero unauthenticated writes |
| O4 | CRUD for ≥3 entities | Full CRUD for User, Film, Cinema, Showtime, and Booking — five entities |
| O5 | Demonstrable quality | ≥70% line coverage on server; unit, integration, system, and usability tests documented; ESLint and `tsc` clean |
| O6 | Automated pipeline | GitHub Actions runs lint, type-check, and tests on every push; green build on `main` |
| O7 | Data integrity | Zero double-bookings under a 50-concurrent-request test on a single seat |
| O8 | Payment correctness | No seat is confirmed without a Stripe-verified successful payment; no customer is charged without a confirmed seat; confirmation is idempotent and never trusts the client |
| O9 | Reliable notification | Booking confirmation delivered by email and SMS; a delivery failure never rolls back or blocks a paid booking |
| O10 | Effective session control | A JWT issued before a password reset is rejected afterwards; rate-limit counters survive a process restart |

## A4. Scope

### A4.1 In scope

- **Customer web client:** browse films now showing and coming soon, view film detail, pick a cinema and showtime, interactive seat selection, Stripe card payment, booking confirmation, booking history, cancellation, account management.
- **Admin client (role-gated):** manage films, cinemas, screens, showtimes, and view/refund bookings.
- **Authentication:** registration with email verification, login, forgot-password and reset flows, JWT session handling, role-based access.
- **Payments:** Stripe PaymentIntent flow in **test mode**, confirmed by server-side retrieval using the secret key (ADR-014), with a mandatory reconciliation job.
- **Notifications:** transactional email via Nodemailer (verification, password reset, booking confirmation, showtime cancellation) and SMS via Notify.lk (booking confirmation, showtime cancellation).
- **Realtime:** Socket.IO broadcasting seat hold, release, and booking events per showtime.
- **CRUD** for User, Film, Cinema (with Screens), Showtime, and Booking.
- Automated test suites, CI/CD pipeline, containerised deployment.

### A4.2 Out of scope

- **Live payment processing.** Stripe operates in test mode only, using Stripe's published test card numbers. No real money moves and no real card data is handled at any point.
- Physical ticket printing, barcode scanning at the door, or POS integration.
- **Dynamic or surge pricing** — a seat's price never varies with demand, time-to-showtime, or booking volume. (This is separate from the fixed **seat tiers** STANDARD/PREMIUM/RECLINER, which *are* in scope — D8, §C1.3, §C6.2 — and simply set a per-section multiplier on a showtime's `basePrice`, frozen at creation.)
- Loyalty schemes, gift cards, or refunds to arbitrary payment methods.
- Native mobile apps.
- Horizontal scaling of the WebSocket layer across multiple server instances (see ADR-003).

### A4.3 Assumptions and constraints

- **Technology constraint (from brief):** React frontend (TypeScript permitted); Node.js-only backend (JavaScript); MongoDB only; WebSockets mandatory; no other server or language permitted.
- **Third-party services:** Stripe, Nodemailer/SMTP, and Notify.lk are external SaaS APIs consumed over HTTPS from the Node.js backend. They are **not additional backend servers** in the sense the brief prohibits — no additional application server or language is introduced into the stack. *Action: confirm this reading with the module leader early.*
- **No second database (compliance, resolved):** the brief states that "other types of database are not permitted." Earlier drafts of this document proposed Redis for shared ephemeral state and were carried under a written compliance risk (R20). That risk is retired: ADR-013 now adopts **Option D** — two MongoDB TTL collections (`revokedtokens`, `ratelimits`) — so MongoDB remains the sole datastore of any kind, and the compliance question does not arise at all.
- **Assumption:** peak concurrency is modest (§A7); a single API instance suffices.
- **Assumption:** Notify.lk is appropriate as the SMS gateway given a Sri Lankan user base; international numbers may not be deliverable, so SMS is treated as best-effort and email as the primary channel.
- **Assumption:** screen seat layouts are fixed per screen and do not change once showtimes are published.
- **Constraint:** the API requires outbound network access to Atlas, Stripe, the SMTP host, and Notify.lk; CI runners require access to Atlas only, since all third-party integrations are mocked in tests.
- **AI-use constraint:** generative AI used only in the brief's permitted assistive roles; all submitted code is written and understood by the developer.

## A5. Stakeholders and users

| Stakeholder | Interest / role |
|---|---|
| Customer | Primary end user; books cinema tickets |
| Cinema administrator | Manages films, screens, showtimes, bookings |
| Module leader / assessor | Evaluates against the rubric |
| Developer (you) | Designs, builds, tests, documents |
| Stripe / SMTP provider / Notify.lk | External service providers; availability affects the system |

**User types** (expanded in SRS §C3): unauthenticated visitor, unverified registrant, verified customer, administrator.

## A6. System architecture

### A6.1 Architectural style

A **modular monolith** on the server (a single deployable Node.js process with strict internal layering) behind a React SPA, with MongoDB Atlas as the system of record for both durable and ephemeral state (ADR-013 Option D), Socket.IO for realtime, and three outbound third-party integrations. Rationale and alternatives are in **ADR-001**.

### A6.2 Component diagram

```
                    ┌──────────────────────────────────┐
                    │        Browser (client)          │
                    │  React + TypeScript SPA          │
                    │  · Film / showtime browse        │
                    │  · Seat map (live)               │
                    │  · Stripe Elements (iframe)      │
                    │  · Account / bookings            │
                    └──┬─────────┬──────────────┬──────┘
                HTTPS  │  WS     │        HTTPS │ (card data —
               (REST)  │         │              │  never touches
                       │         │              │  our server)
    ┌──────────────────▼─────────▼───────┐      │
    │   Node.js / Express API container  │      │
    │                                    │      │
    │  Routes ─▶ Controllers ─▶ Services │      │
    │     ▲                        │     │      │
    │  Auth m/ware            ┌────┴────┐│      │
    │  Rate limiter           │ Models  ││      │
    │  Payment verifier       │(Mongoose)│      │
    │  Socket gateway         └────┬────┘│      │
    │  Hold-expiry sweeper         │     │      │
    └───┬─────────┬─────────┬──────│─────┘      │
        │         │         │      │            │
        │         │         │      │ TLS        │
        │         │         │  ┌────────────────┐  │
        │         │         │  │ MongoDB Atlas  │  │
        │         │         │  │ SYSTEM OF      │  │
        │         │         │  │ RECORD, plus   │  │
        │         │         │  │ TTL collections│  │
        │         │         │  │ revokedtokens, │  │
        │         │         │  │ ratelimits     │  │
        │         │         │  └────────────────┘  │
        │         │         │                   │
   ┌────▼────┐ ┌──▼──────┐ ┌▼──────────┐        │
   │ SMTP    │ │Notify.lk│ │  Stripe   │◀───────┘
   │(Nodemai-│ │  (SMS)  │ │ (payments)│
   │ ler)    │ │         │ │           │
   └─────────┘ └─────────┘ └───────────┘
                          ▲ server-side retrieve()
                          │ using SECRET key — the server asks
                          │ Stripe directly; the client never
                          │ asserts that payment succeeded
```

**Deployment topology:** two locally orchestrated containers (client, API) plus a managed Atlas replica set hosted externally — three independently hosted tiers, satisfying the brief's distribution requirement. There is no Redis (or any other second database) container — ADR-013 Option D holds all shared ephemeral state in MongoDB alongside the durable data.

**Data authority:** MongoDB Atlas is the sole system of record, **and the sole datastore of any kind** — durable collections (users, films, cinemas, showtimes, bookings, holds) and ephemeral TTL collections (`revokedtokens`, `ratelimits`) live side by side in the same cluster (ADR-013). **Seat state is never cached.** Three outbound SaaS integrations complete the picture. **All traffic is outbound** — no inbound webhook endpoint is required (ADR-014), and the legacy webhook route has been removed (D7).

**Critical security properties:** (1) card details are entered into a Stripe-hosted iframe (Stripe Elements) and travel directly from the browser to Stripe — they never reach the Encore client bundle, API, or database; (2) payment status is obtained by the **server** calling Stripe with its secret key, never from a client claim. See **ADR-009** and **ADR-014**.

### A6.3 Layer responsibilities

| Layer | Technology | Responsibility |
|---|---|---|
| Client | React + TypeScript, CSS | UI, seat map, WebSocket subscription, Stripe Elements mounting |
| Routes | Express Router (JavaScript) | HTTP edge; URL → controller mapping only |
| Middleware | Express | JWT verification, role checks, rate limiting, validation, error handling |
| Controllers | Express handlers | Parse request, call service, shape response |
| Services | Plain JS modules | Domain logic: seat holds, booking, pricing, payment orchestration, notification dispatch |
| Socket gateway | Socket.IO | Room management; broadcast hold/release/book events |
| Scheduler | `node-cron` or interval | Sweep expired seat holds; retry failed notifications |
| Integrations | Stripe SDK, Nodemailer, Notify.lk HTTP client | Isolated adapters, each behind a service interface for testability |
| Ephemeral state | MongoDB TTL collections | Rate-limit counters (`ratelimits`), JWT revocation (`revokedtokens`). **Never seat state, never a catalogue cache** (ADR-013 Option D) |
| Models | Mongoose | Schema, validation, indexes, atomic operations |
| Data | MongoDB Atlas | Persistence — the sole system of record |

Controllers contain no domain logic; services contain no HTTP concepts; integration adapters are the only modules that know a third party exists. This layering is the concrete **single-responsibility** and **dependency-inversion** evidence cited in the report's Design section.

### A6.4 Configuration and secrets handling

The system now holds **five** categories of secret. Every one is a credential, and none may reach the repository.

| Variable | Purpose | Exposure if leaked |
|---|---|---|
| `MONGODB_URI` | Atlas connection (embeds password) | Full database read/write |
| `JWT_SECRET` | Signs session tokens | Complete authentication bypass |
| `STRIPE_SECRET_KEY` | Server-side Stripe API calls | Account access; financial exposure |
| `SMTP_USER` / `SMTP_PASS` | Nodemailer transport | Mail relay abuse; phishing from your domain |
| `NOTIFY_LK_API_KEY` / `NOTIFY_LK_USER_ID` | SMS gateway | Billed SMS spend; SMS spoofing |

**Client-side variables are public.** Only `VITE_STRIPE_PUBLISHABLE_KEY` and `VITE_API_URL` may appear in the client. A publishable key is designed to be public; a **secret key must never** appear in client code, since anything in the bundle is readable by anyone.

**Controls:**

| Environment | Source | Notes |
|---|---|---|
| Local development | `.env`, git-ignored | Never committed |
| Docker | `env_file` in compose, values from host | Compose file contains no secret |
| CI (GitHub Actions) | Repository secrets | Only `MONGODB_URI` needed; integrations are mocked |
| Repository | `.env.example`, placeholders only | Documents required variables without exposing them |

- `.gitignore` contains `.env` **before** the first commit that creates one.
- Stripe keys are **test-mode keys only** (`sk_test_…` / `pk_test_…`). Live keys are never generated for this project.
- Git history is scanned for committed credentials before submission; any exposed key is rotated immediately at the provider.
- This matters beyond good practice: the repository link is submitted for marking, and a leaked live credential in git history is both a security failure and an avoidable professionalism mark.

### A6.5 Data flow — the critical path (booking a seat with payment)

Payment introduces seconds of latency between seat selection and confirmation. The seat must therefore be **held** across that gap, which is why ADR-004's simple atomic-update-at-submit model is superseded by **ADR-012**. Confirmation uses server-side retrieval rather than a webhook (**ADR-014**).

```
 1. Client   GET /api/showtimes/:id                → showtime + seat states
 2. Client   socket.emit('join:showtime', id)      → joins room `showtime:<id>`
 3. User selects seats (client-side state only)
 4. Client   POST /api/holds {showtimeId, seatIds} + JWT   ← creates the Hold ONLY, no Stripe call (D12)
 5. Server   atomic conditional update: seats available → held,
             holdRef = <id>, holdExpiresAt = now + 10 min
 5a. matchedCount = 0 → 409 SEAT_UNAVAILABLE
 5b. success        → broadcast 'seats:updated' {status:'held'}; → 201 {holdId, expiresAt, amountMinor}
 6. Client   POST /api/holds/:id/payment-intent            ← separate call creates the Stripe PaymentIntent (D12)
 6a. Server  create Stripe PaymentIntent (amount computed SERVER-SIDE)
             metadata: {holdId, showtimeId, userId}
             idempotency key: holdId
 7. Server   → 201 {clientSecret, expiresAt, amount}
 8. Client   mounts Stripe Elements with clientSecret; user enters card
             (card data goes browser → Stripe directly, never via our API)
 9. Client   stripe.confirmPayment() → Stripe processes the charge
10. Client   POST /api/bookings/confirm {holdId}   ← asks the server to CHECK,
                                                     does NOT assert success
11. Server   load hold; verify it belongs to this user and has not expired
12. Server   stripe.paymentIntents.retrieve(pi_id)  ← SECRET key, server→server
13. Server   verify ALL of:
             · status === 'succeeded'
             · amount === server-recomputed total
             · currency matches
             · metadata.holdId === requested holdId
             any mismatch → abort, log security event, 402/409
14. Server   atomic: seats held-by-this-hold → booked; create Booking
             (unique index on paymentIntentId makes a repeat call a no-op)
15. Server   broadcast 'seats:updated' {status:'booked'}
16. Server   enqueue notifications (email + SMS) — async, non-blocking
17. Server   → 200 {booking}  → client routes to confirmation
```

**Why holds and PaymentIntents are separate calls (D12).** `POST /api/holds` only reserves seats — it makes no Stripe call and needs no Stripe keys at all. `POST /api/holds/:id/payment-intent` is a distinct follow-up call that creates the PaymentIntent for an existing hold. Splitting them lets the realtime-propagation and hold-expiry e2e journeys (§D4.4) exercise the full hold lifecycle without any Stripe key configured.

**Why step 10 is safe.** The client supplies only a `holdId`. It cannot claim a payment succeeded, cannot supply an amount, and cannot nominate a PaymentIntent. Every fact used to authorise the booking is fetched by the server from Stripe in step 12. A forged request for someone else's hold fails at step 11; a request whose payment did not actually succeed fails at step 13.

**Failure paths:**

| Failure | Handling |
|---|---|
| User abandons at step 8 (never pays) | Sweeper releases the hold at expiry; seats broadcast back to `available` |
| Payment fails at step 9 | Hold remains until expiry so the user can retry with another card; no seat lost |
| **Customer pays, then closes the tab before step 10** | **Reconciliation job (every 2 min) finds a succeeded PaymentIntent with an unfulfilled hold, completes the booking, and sends the confirmation.** This is an ordinary event under ADR-014, not an edge case — reconciliation is mandatory, not a backstop |
| Confirm called twice (retry, double-click, or reconciliation racing the client) | Unique index on `paymentIntentId` rejects the duplicate; the existing booking is returned with 200 |
| Forged confirm for another user's hold | Rejected at step 11 with 403; logged |
| Confirm where payment did not succeed | Rejected at step 13; no seat allocated |
| Amount tampering | Step 13 compares the Stripe amount against the server-recomputed total; mismatch aborts |
| Payment succeeds but seat allocation fails | Booking flagged `allocation_failed`, admin alerted, automatic Stripe refund issued |
| Notification fails (step 16) | Logged and retried; **never** rolls back a paid booking (O9) |

Step 16 being outside the transaction is deliberate: a customer who has paid must never lose their seat because an SMS gateway was down.

## A7. Load estimation and scale

| Metric | Estimate | Basis |
|---|---|---|
| Registered users | ~2,000 | Coursework-scale demonstration |
| Concurrent viewers per popular showtime | 50–100 | Opening-weekend spike |
| Peak API requests | ~25 req/s | Browsing dominates |
| Peak WebSocket connections | ~250 | Viewers across all live showtimes |
| Bookings per day | ~500 | Well within single-instance capacity |
| Emails per day | ~700 | Verification + confirmation + reset |
| SMS per day | ~500 | Booking confirmations |
| Data volume (1 year) | < 1 GB | Bookings and showtimes dominate |
| TTL collection working set | < 20 MB | `revokedtokens` and `ratelimits` — both bounded by short expiry (ADR-013 Option D) |

**Conclusion:** a single API instance and a shared-tier Atlas cluster are sufficient. SMTP and SMS volumes sit within free/low-cost tiers. Horizontal scaling is explicitly deferred (§A4.2).

## A8. Deliverables

| ID | Deliverable | Description |
|---|---|---|
| D1 | Report (PDF, ≤2,000 words) | Requirements, design, testing, DevOps, evaluation; GitHub + YouTube links on page 1 |
| D2 | Source code | GitHub Classroom repo, excluding `node_modules` |
| D3 | Video (≤5 min, narrated) | Demo of functionality + tests + pipeline running |
| — | This PID/SRS/ADR set | Planning baseline (appendix material for D1) |

## A9. Project plan and milestones

| Sprint | Focus | Key outputs | Exit criteria |
|---|---|---|---|
| S0 — Setup | Repo, tooling, CI, Atlas, secrets, Stripe/SMTP/Notify.lk test accounts | ESLint + Jest + `tsc` configured; `.env` ignored | Empty pipeline green; API connects to Atlas; no secrets in git |
| S1 — Auth core | User model, register, login, JWT, bcrypt | Auth endpoints + unit tests | FR-1–5 pass |
| S2 — Auth hardening | Email verification, forgot/reset password, rate limiting, Nodemailer | Verification + reset flows working end to end | FR-6–12 pass; tokens hashed, single-use, TTL-bound |
| S3 — Catalogue CRUD | Film, Cinema/Screen, Showtime models + endpoints | CRUD for all catalogue entities | All CRUD integration tests green |
| S4 — Holds + realtime | Socket.IO, seat holds, expiry sweeper, concurrency | Live seat state; hold lifecycle | O7 met (zero double-bookings) |
| S5 — Payments + revocation | Stripe PaymentIntent, Elements, **server-side retrieval confirm**, idempotency index, **reconciliation job**; MongoDB TTL collections for rate limits and `jti` revocation (ADR-013 Option D) | Paid booking flow end to end; revocation working | O8 met; abandoned-tab booking completed by reconciliation; a pre-reset token is rejected after reset |
| S6 — Notifications | Email + SMS on confirmation and cancellation; retry | Notifications delivered, failures non-blocking | O9 met |
| S7 — Client + Admin | Full UI, admin dashboard, containers | `docker-compose` stack running | Full journey works end to end |
| S8 — Test + UAT | Usability round, coverage push, static analysis | UAT results + modifications | O5 met |
| S9 — Hardening + Docs | Bug-fix, report, video | Report, video, tagged release | Submission-ready |

**Milestones:** M1 auth (S1) · M2 verified auth (S2) · M3 catalogue (S3) · M4 realtime + integrity (S4) · M5 payments (S5) · M6 notifications (S6) · M7 distributed stack (S7) · M8 verified quality (S8) · M9 submission (S9).

## A10. Risk register

| ID | Risk | L | I | Mitigation | Owner |
|---|---|---|---|---|---|
| R1 | WebSocket sync complexity underestimated | Med | High | Build realtime early (S4); spike a minimal broadcast first | Dev |
| R2 | Scope creep from an ambitious feature set | High | Med | MoSCoW (§C4); "could" features cut first | Dev |
| R3 | Limited staff support over summer | High | Med | Front-load risky work; stay on well-supported stack | Dev |
| R4 | Seat race conditions / double-booking | Med | High | Atomic conditional update + TTL hold (ADR-012); concurrency test in CI | Dev |
| R5 | CI/CD misconfiguration | Med | Low | Pipeline established in S0 before features exist | Dev |
| R6 | Time overrun as solo developer | Med | High | Timeboxed sprints; cut "could" features to protect core | Dev |
| R7 | Socket state stale after server restart | Low | Med | Clients re-fetch authoritative state on reconnect | Dev |
| R8 | Insufficient UAT participants | Med | Med | Recruit early in S7; target 5, minimum 3 | Dev |
| R9 | **Credentials committed to a public repo** | Med | **High** | `.env` git-ignored from first commit; `.env.example` placeholders; credential scan before submission; rotate on exposure | Dev |
| R10 | Atlas IP allowlist blocks CI | Med | Med | Configure Atlas network access in S0; verify pipeline connects | Dev |
| R11 | Network dependency — demo fails without internet | Low | High | Verify connectivity before recording; local MongoDB fallback profile | Dev |
| R12 | Shared-tier Atlas throttling under concurrency test | Low | Med | Run concurrency test against `mongodb-memory-server` | Dev |
| **R13** | **Customer pays then closes the tab before confirm** | **Med** | **High** | Reconciliation job every 2 min is a *core* requirement under ADR-014, not a backstop; tested explicitly (D4.3b) | Dev |
| **R14** | **Payment taken but seat not allocated** | Low | **High** | Idempotent confirm via unique `paymentIntentId` index; reconciliation job; automatic refund + admin alert on allocation failure (ADR-014) | Dev |
| **R23** | **Confirm endpoint accepts client-supplied payment facts** | Low | **High** | Endpoint accepts `{holdId}` only; all payment facts retrieved server-side; explicit test that a forged confirm is rejected (ADR-014) | Dev |
| **R15** | **Orphaned seat holds strand inventory** | Med | Med | Every read treats `holdExpiresAt < now` as released, independent of sweeper timing; sweeper runs every 60s. **No MongoDB TTL index exists on `holds`** — a TTL index would delete the very record the reconciliation job (FR-39) needs to read (ADR-012) | Dev |
| **R16** | **SMTP or Notify.lk outage blocks booking** | Med | High | Notifications dispatched asynchronously outside the booking transaction; failures logged and retried, never rolled back (O9) | Dev |
| **R17** | **Notify.lk credit exhausted or number undeliverable** | Med | Low | SMS is best-effort; email is the authoritative channel; failures surfaced in admin log not to the customer as an error | Dev |
| **R18** | **Verification/reset token leaked or replayed** | Low | High | Tokens random, hashed at rest, single-use, short TTL, invalidated on use and on password change (ADR-011) | Dev |
| **R19** | **User enumeration via auth endpoints** | Med | Med | Identical response and timing for existing and non-existing emails on login, registration, and password reset | Dev |
| **R20** | **A revoked-but-expired TTL row is trusted as still valid because the reaper has not yet swept it** | Low | **High** | Read-time correctness rule (ADR-013 Option D): a `revokedtokens`/`ratelimits` row past its `expiresAt` is treated as absent at query time, never trusted merely because it has not yet been physically deleted | Dev |
| **R21** | **`ratelimits` writes on every auth attempt add load MongoDB was not sized for** | Low | Med | Window-bucketed counters (not one document per attempt); indexed on the rate-limit key; monitored against NFR-2's latency target | Dev |

## A11. Monitoring and observability

- **Structured logging:** JSON with request id, user id, route, status, duration. Payment and notification events logged with correlation ids.
- **Health endpoint:** `GET /api/health` reports API status, MongoDB connectivity, and last successful outbound call per integration.
- **Error tracking:** all unhandled errors funnel through one Express error middleware; logged with stack, safe message returned.
- **Key signals:** 5xx rate, 409 conflict rate, WebSocket connection count, p95 booking latency, **held-seat count and hold expiry rate**, **confirm failure count and reconciliation-completed booking count** (a rising reconciliation share signals clients not returning), **email/SMS delivery failure rate**, **`ratelimits` and `revokedtokens` collection sizes** (a sanity check that TTL expiry is actually reclaiming space).
- **Atlas dashboard** supplies connection counts, slow-query logs, and storage usage; **Stripe dashboard** provides an independent record of every payment for reconciliation.

## A12. Ethics, security, and academic integrity

- **Ethics:** usability testing follows University guidelines — informed consent, right to withdraw, anonymised results. Participants use test accounts and Stripe test cards only.
- **Security:** bcrypt password hashing (cost ≥10); JWT with short expiry; email verification before booking; hashed single-use reset tokens; rate limiting on all auth endpoints; role checks enforced server-side; payment status verified server-to-server with Stripe rather than trusted from the client; input validation on every endpoint; no card data touching our systems; no personal data in query strings; no secrets in the client bundle.
- **Data protection:** the system stores names, emails, and phone numbers. Only what is needed is collected; passwords are never stored in plaintext or logged; personal data never appears in URLs or analytics.
- **Academic integrity:** all work is the developer's own; sources referenced; generative AI used only within the brief's permitted assistive categories.

## A13. Third-party service configuration

| Service | Purpose | Mode | Setup notes |
|---|---|---|---|
| **Stripe** | Card payments | **Test mode only** | Test keys only. **No webhook endpoint and no Stripe CLI required** — confirmation is by server-side retrieval (ADR-014). Use Stripe's published test card numbers exclusively |
| **Nodemailer + SMTP** | Transactional email | Real sending | Use a dedicated test mailbox or a capture service (e.g. Mailtrap) during development to avoid sending to real addresses |
| **Notify.lk** | SMS delivery | Real sending | REST API with API key, user id, and registered sender id; keep credit topped up; verify number formatting for Sri Lankan mobile numbers before the demo |

All three are wrapped in an adapter behind a service interface so they can be replaced by fakes in tests (§D5). **No test in the suite makes a real outbound call to any of them.**
# Part B — Architecture Decision Records

Fourteen decisions material enough to warrant a record. Each states the forces at play, the options genuinely considered, the trade-offs, and what the decision makes harder — not just what it makes easier.

---

## ADR-001: Modular monolith over microservices

**Status:** Accepted · **Date:** 2026-08-23 · **Deciders:** Developer (sole)

### Context
The brief permits multiple optional backend servers. The system has three broad concerns — accounts, catalogue (films/cinemas/showtimes), and booking/payment/realtime. A solo developer has 80+ hours and limited staff support. The report must describe whether the architecture is monolithic or micro-service based, so the choice must be deliberate and defensible either way.

### Decision
Build a **single Node.js/Express service with strict internal module boundaries** (routes → controllers → services → models), deployed as one container alongside the client and database containers.

### Options considered

**Option A — Modular monolith (chosen)**

| Dimension | Assessment |
|---|---|
| Complexity | Low |
| Time to market | Fast |
| Scalability | Adequate for estimated load (§A7) |
| Team familiarity | High |
| Operational burden | Low — one service to run and debug |

**Pros:** one codebase, one deploy, no network calls between concerns, transactional simplicity, far less YAML and infrastructure work; a solo developer can hold the whole system in their head.
**Cons:** all concerns scale together; a fault in one module can affect the process; module boundaries are enforced by discipline rather than by the network.

**Option B — Microservices (auth service + catalogue service + booking service + payment service)**

| Dimension | Assessment |
|---|---|
| Complexity | High |
| Time to market | Slow |
| Scalability | Better in principle, unnecessary at this load |
| Team familiarity | Moderate |
| Operational burden | High — 3+ services, inter-service auth, distributed debugging |

**Pros:** independent scaling and deployment; hard boundaries; demonstrates distributed-systems breadth.
**Cons:** distributed transactions across booking and catalogue become genuinely hard; the seat-booking atomicity guarantee (ADR-004) would need a saga or distributed lock; debugging spans processes; the effort would come directly out of the testing and realtime budget, which carry more marks.

### Trade-off analysis
The decisive factor is that the estimated peak load (§A7) is roughly 20 req/s — three orders of magnitude below where service decomposition pays for itself. Microservices would buy scalability the system does not need, at the direct cost of the booking-integrity guarantee (O7) and test coverage (O5), which are both explicitly assessed. Choosing the monolith is therefore not the easy option but the correct one for the constraints; the internal layering preserves the option to extract a service later.

### Consequences
- **Easier:** atomic booking logic, local debugging, one CI pipeline, one deployment.
- **Harder:** modules must be kept separate by convention; a lint rule and code review substitute for network boundaries.
- **Revisit when:** sustained load exceeds ~200 req/s, or the booking module's release cadence needs to diverge from the catalogue's.

### Action items
1. [ ] Enforce `routes → controllers → services → models` import direction.
2. [ ] Keep the socket gateway behind a service interface so it can be extracted later.

---

## ADR-002: MongoDB with an embedded seat array

**Status:** Accepted · **Date:** 2026-08-23 · **Deciders:** Developer (sole)

### Context
The brief permits MongoDB or PouchDB only. Within MongoDB, seat state can be modelled either as an array embedded in the Showtime document or as a separate `seats` collection. This choice determines how seat availability is read and how booking concurrency is controlled.

### Decision
Use **MongoDB**, with seats **embedded as an array inside the Showtime document**, and bookings in a separate referencing collection.

### Options considered

**Option A — Embedded seat array on Showtime (chosen)**

| Dimension | Assessment |
|---|---|
| Read performance | Excellent — one query renders the whole seat map |
| Write atomicity | Excellent — single-document updates are atomic in MongoDB |
| Complexity | Low |
| Document size risk | Acceptable — 300 seats ≈ 25 KB, far below the 16 MB limit |

**Pros:** the entire seat map arrives in one round trip; MongoDB guarantees single-document atomicity, which gives concurrency safety for free (ADR-004); no joins.
**Cons:** very large auditoria (>2,000 seats) would bloat the document; seat-level queries across showtimes are awkward.

**Option B — Separate `seats` collection**

**Pros:** unbounded auditorium size; seats queryable independently.
**Cons:** rendering a seat map needs a second query or `$lookup`; booking multiple seats atomically now spans multiple documents, requiring a multi-document transaction — significantly more complex and slower.

**Option C — PouchDB**

**Pros:** offline-first sync is interesting.
**Cons:** its sync model conflicts with the requirement that the server be the single authority on seat state; last-write-wins conflict resolution is precisely wrong for ticket booking, where a conflict must reject one party rather than silently merge.

### Trade-off analysis
Option A trades unbounded auditorium size — which the assumptions in §A4.3 make irrelevant — for atomicity that is otherwise expensive to obtain. PouchDB is rejected on correctness grounds, not convenience: an eventually-consistent store cannot uphold the no-double-booking requirement (O7).

### Consequences
- **Easier:** seat map reads, booking atomicity, schema comprehension.
- **Harder:** supporting stadium-scale auditoria; per-seat analytics across showtimes.
- **Revisit when:** a screen exceeds ~2,000 seats, or seat-level cross-event reporting is required.

### Action items
1. [ ] Cap seeded screen size at 300 seats.
2. [ ] Index `showtimes.startsAt` and `bookings.userRef` (see §C6.3).

---

## ADR-003: Socket.IO over raw WebSockets

**Status:** Accepted · **Date:** 2026-08-23 · **Deciders:** Developer (sole)

### Context
The brief mandates WebSockets to give the appearance of communication between multiple clients. The system needs per-showtime broadcast (only clients viewing showtime X should receive X's seat updates), and must behave sanely when a client's connection drops.

### Decision
Use **Socket.IO**, with one room per showtime (`showtime:<id>`).

### Options considered

**Option A — Socket.IO (chosen)**

| Dimension | Assessment |
|---|---|
| Complexity | Low |
| Features needed | Rooms, auto-reconnect, heartbeat — all built in |
| Team familiarity | High |
| Overhead | Slightly larger payload than raw `ws` |

**Pros:** rooms give per-showtime targeting without hand-rolled subscription bookkeeping; automatic reconnection with backoff directly mitigates R7; mature client library; broad documentation and staff familiarity.
**Cons:** a protocol layer on top of WebSocket, so slightly heavier frames and a dependency on matching client/server versions.

**Option B — Raw `ws` library**

**Pros:** minimal, no abstraction, smallest frames.
**Cons:** rooms, reconnection, and heartbeats must all be written by hand — roughly the same code Socket.IO already provides, but untested and consuming hours budgeted for testing.

### Trade-off analysis
The only genuine advantage of raw `ws` is payload size, which is immaterial at 200 concurrent connections. The reconnection and room logic that would have to be reimplemented is exactly the kind of infrastructure code that generates bugs and consumes the testing budget. Socket.IO is the disciplined choice, not the lazy one.

### Consequences
- **Easier:** per-showtime targeting, reconnection resilience, client integration.
- **Harder:** scaling beyond one server instance later requires a pub/sub adapter for cross-instance broadcast, which is explicitly out of scope (§A4.2). **Update (ADR-013):** ADR-013 Option D deliberately does not introduce Redis, so this scaling path stays closed rather than opening — consistent with multi-instance deployment remaining out of scope.
- **Revisit when:** a second API instance is introduced.

### Action items
1. [ ] Namespace rooms as `showtime:<id>`.
2. [ ] On client reconnect, re-fetch authoritative seat state rather than trusting cached state.

---

## ADR-004: Atomic conditional update for seat concurrency

**Status:** ⚠️ **SUPERSEDED by ADR-012** · **Date:** 2026-08-23 · **Deciders:** Developer (sole)

> **Superseded because:** this decision assumed booking is a single instantaneous request. Introducing Stripe (ADR-009) puts seconds of user-driven latency between seat selection and payment confirmation, during which the seat must not be sold to anyone else. The atomic-update-at-submit model cannot express that gap. The atomicity *technique* recorded here is retained and reused by ADR-012 — what changes is *when* it fires. This record is kept rather than deleted so the reasoning chain remains visible.

### Context
Two users may attempt to book the same seat within milliseconds. Requirement O7 and FR-29 demand that exactly one succeeds. This is the single most important correctness property in the system.

### Decision
Perform booking as a **single atomic conditional update** on the Showtime document: match the event *and* the requirement that all requested seats are still `available`, and set them to `booked` in one operation. If `matchedCount` is 0, the seats were taken in the interim and the request returns `409 Conflict`.

### Options considered

**Option A — Atomic conditional update (chosen)**

**Pros:** relies on MongoDB's guaranteed single-document atomicity; no locks to acquire or release; no deadlocks; no cleanup required if a client disappears mid-checkout; correct by construction.
**Cons:** the losing user learns of the conflict only at submission, not at selection time.

**Option B — Read-then-write (check availability, then update)**

**Pros:** simple to write.
**Cons:** a textbook time-of-check-to-time-of-use race. Two requests can both read "available" before either writes. **Rejected as incorrect.**

**Option C — Pessimistic seat hold with TTL lock**

**Pros:** the losing user is told immediately at selection time; better UX during a high-demand on-sale.
**Cons:** requires a lock store, TTL expiry handling, and cleanup for abandoned checkouts; introduces the possibility of seats stranded in a held state after a crash; substantially more code and more failure modes.

### Trade-off analysis
Option B is not a real option — it is the bug this ADR exists to prevent, recorded here so the report can show the race was reasoned about rather than stumbled into. Option C offers genuinely better UX and is what a commercial ticketing platform would do at scale, but it buys that UX with a stateful lock lifecycle that is a meaningful source of defects. Given a solo developer and a hard correctness requirement, Option A is chosen: correctness first, with a `seats:updated` broadcast (ADR-003) narrowing the conflict window in practice, since most clients see a seat disappear before they try to book it.

### Consequences
- **Easier:** provable correctness; no lock lifecycle; trivially testable with concurrent requests.
- **Note (post-supersession):** Option C below — the pessimistic TTL hold that was rejected here as unnecessary complexity — becomes the *correct* choice once payment latency enters the flow. See ADR-012.
- **Harder:** a small residual window where a user selects a seat and is rejected at checkout; the client must handle 409 gracefully with a clear message and a refreshed map.
- **Revisit when:** on-sale contention becomes high enough that 409s are common — then move to Option C.

### Action items
1. [ ] Implement the conditional update in `bookingService`.
2. [ ] Write a concurrency test firing 50 simultaneous bookings at one seat; assert exactly one 201 and 49 409s.
3. [ ] Client handles 409 with "That seat was just taken" and re-renders from server state.

---

## ADR-005: JWT over server-side sessions

**Status:** Accepted · **Date:** 2026-08-23 · **Deciders:** Developer (sole)

### Context
The brief requires security considerations including registration and login. The API is consumed by a separate React origin and must authenticate both REST requests and the WebSocket handshake.

### Decision
Use **stateless JWTs** with a short expiry, sent as a `Bearer` token and verified by Express middleware and at the Socket.IO handshake.

### Options considered

**Option A — JWT (chosen)**

**Pros:** stateless, so no session store to run; works cleanly across the client's separate origin; the same token authenticates both HTTP and the socket handshake; the FAQ explicitly permits JWTs.
**Cons:** tokens cannot be revoked before expiry; payload is readable (signed, not encrypted); requires care over storage on the client.

**Option B — Server-side sessions with a cookie**

**Pros:** instant revocation; opaque identifier reveals nothing.
**Cons:** requires a session store (a second stateful dependency); cross-origin cookie configuration adds friction; authenticating the socket handshake is more awkward.

### Trade-off analysis
Revocation is the one real advantage of sessions, and it matters most for long-lived privileged sessions. It is mitigated here with short token lifetimes. Against that, sessions would add a stateful store to a system whose statelessness is a design asset. JWT is chosen with the revocation weakness acknowledged rather than glossed over.

### Consequences
- **Easier:** stateless API, uniform auth for HTTP and WebSocket, simple horizontal scaling later.
- **Harder:** immediate logout-everywhere; token storage must avoid XSS exposure.
- **Revisit when:** admin privilege escalation or forced logout becomes a requirement — then add a short-lived access token plus a revocable refresh token.
- **Update (ADR-013):** the revocation weakness acknowledged above is now addressed. A MongoDB `revokedtokens` TTL collection (ADR-013 Option D) makes password reset genuinely invalidate outstanding sessions (FR-15), which this decision alone could not deliver.

### Action items
1. [ ] Set a short access-token expiry.
2. [ ] Verify the token in the Socket.IO handshake, not only on REST routes.
3. [ ] Never place the token in a URL query string (NFR-11).

---

## ADR-006: No caching layer

**Status:** Accepted — **Amended by ADR-013 (Option D)** · **Date:** 2026-08-23 · **Deciders:** Developer (sole)

> **Amended, not superseded, because:** an earlier revision of ADR-013 (v3.1) superseded this record by introducing a Redis cache. ADR-013 has since been revised to **Option D**, which drops caching of any kind — catalogue caching included — and instead adds two MongoDB TTL collections for shared ephemeral state (token revocation, rate limiting), a concern this record never addressed. **The core argument below is fully intact and, if anything, strengthened:** no caching layer exists anywhere in the system, seat state is never cached, and neither is the catalogue. ADR-013 Option D amends this record only by extending MongoDB's role to non-cache ephemeral state; it does not reopen the caching question.

### Context
Event listings are read-heavy and would be an obvious caching candidate. A Redis cache is a common instinct at this point in a design.

### Decision
**Introduce no caching layer.** Serve all reads directly from MongoDB, relying on indexes (§C6.3).

### Options considered

**Option A — No cache (chosen)**

**Pros:** no staleness risk on seat state — the correctness property the whole system rests on; no extra container; no invalidation logic; MongoDB at 20 req/s with proper indexes is nowhere near strained.
**Cons:** forgoes read-latency headroom the system does not currently need.

**Option B — Redis cache for event listings**

**Pros:** faster listing reads; useful practice with cache-aside.
**Cons:** introduces a fourth container and an invalidation problem; the tempting extension — caching seat state — would directly undermine ADR-004 by serving stale availability.

### Trade-off analysis
Caching here would be optimisation without a measured problem, and the failure mode it invites (stale seat availability) attacks the system's core guarantee. Deliberately declining a component is itself an architectural decision worth recording, and demonstrates restraint rather than an absence of consideration.

### Consequences
- **Easier:** correctness, simpler deployment, fewer moving parts to test.
- **Harder:** if read load grows unexpectedly, headroom must be found through indexing or scaling first.
- **Revisit when:** p95 read latency exceeds 200 ms or MongoDB CPU is sustained above 70%.

### Action items
1. [ ] Add the indexes in §C6.3 and confirm listing queries use them.

---

## ADR-007: MongoDB Atlas (managed) over a self-hosted MongoDB container

**Status:** Accepted · **Date:** 2026-08-23 · **Deciders:** Developer (sole)

### Context
ADR-002 settled MongoDB as the datastore and the embedded-seat-array schema. A separate question remains: where does MongoDB actually run? The options are a self-hosted `mongo` container in `docker-compose`, or a managed MongoDB Atlas cluster reached over the network via a connection string. The brief requires the system to be distributed and capable of running on multiple computers, so the choice must not undermine that.

### Decision
Use a **managed MongoDB Atlas cluster**, with the connection string injected into the API container as the `MONGODB_URI` environment variable. Automated tests run against an ephemeral `mongodb-memory-server` rather than Atlas.

### Options considered

**Option A — MongoDB Atlas managed cluster (chosen)**

| Dimension | Assessment |
|---|---|
| Setup effort | Low — cluster provisioned once, no container tuning |
| Operational burden | Low — backups, patching, monitoring handled by the provider |
| Distribution | Strong — data tier genuinely runs on separate hosts as a replica set |
| Cost | Free/shared tier sufficient at this scale |
| Risk | Introduces a network dependency and a live credential to protect |

**Pros:** no database container to configure or debug; the cluster is a real replica set, so the data tier is distributed in its own right and demonstrably runs on different machines from the API; data survives local container teardown, which matters for UAT sessions and the demonstration video; provider dashboards give free observability.
**Cons:** the system now depends on internet connectivity to run at all; the connection string is a credential that must never reach the repository; shared-tier resource limits are real; CI runners must be permitted through Atlas network access rules.

**Option B — Self-hosted `mongo` container in docker-compose**

| Dimension | Assessment |
|---|---|
| Setup effort | Low–medium |
| Operational burden | Medium — persistence volumes, no backups by default |
| Distribution | Adequate — a separate container, but typically the same host |
| Cost | Free |
| Risk | Data loss on volume removal; single node, no replication |

**Pros:** fully self-contained, works offline, no credential leaves the machine, no third-party dependency, trivially reproducible for a marker running `docker-compose up`.
**Cons:** single-node with no replication; data lost if the volume is pruned; the developer carries all operational concerns; in practice all three containers usually run on one physical host, which is a weaker demonstration of distribution.

### Trade-off analysis
The two genuine costs of Atlas are the network dependency and the credential-handling burden. The network dependency is a real regression in reproducibility — a marker cannot run the stack without the environment variable, which is why `.env.example` and clear README instructions become mandatory rather than optional. The credential burden is a genuine risk (R9) and the most common way this decision goes wrong in student projects: a connection string with an embedded password committed to a repository that is then submitted for marking.

Against that, Atlas removes an entire class of operational work (volumes, persistence, backup) from an 80-hour solo budget, and provides a stronger answer to the "distributed across multiple computers" requirement, since the replica set demonstrably runs on hosts separate from the application. The decisive mitigation is that tests do not depend on Atlas at all — using `mongodb-memory-server` keeps CI fast, offline-capable, and immune to tier limits, so the network dependency is confined to development and demonstration rather than infecting the pipeline.

### Consequences
- **Easier:** no database container to operate; durable data across teardowns; replica-set distribution for free; provider-side monitoring.
- **Harder:** the stack no longer runs offline; every environment needs configuration to start; a live credential must be kept out of git history for the entire life of the repository; Atlas network rules must accommodate CI.
- **Revisit when:** shared-tier limits are hit under load, or offline reproducibility becomes a requirement for marking — a local `mongo` container profile in `docker-compose` is kept as a documented fallback (R11).

### Action items
1. [ ] Add `.env` to `.gitignore` **before** the first commit that creates it.
2. [ ] Commit `.env.example` with placeholder values documenting every required variable.
3. [ ] Store `MONGODB_URI` and `JWT_SECRET` as GitHub Actions repository secrets.
4. [ ] Create separate Atlas databases for development and demonstration, with scoped users.
5. [ ] Configure Atlas network access for CI runners in S0, before feature work.
6. [ ] Install and wire `mongodb-memory-server` for the test suite.
7. [ ] Scan git history for committed credentials before submission; rotate the Atlas password if any exposure is found.
8. [ ] Document the setup steps in the repository README so the stack is reproducible by a marker.

---

## ADR-008: TypeScript on the client, JavaScript on the server

**Status:** Accepted · **Date:** 2026-08-23 · **Deciders:** Developer (sole)

### Context
The brief permits either classic JavaScript or TypeScript, and does not require both sides to match. The client carries substantial stateful complexity — seat selection state, WebSocket event payloads, API response shapes, role-conditional rendering — where type errors are easy to introduce and awkward to catch at runtime. The server is comparatively thin: routes, controllers, services, and Mongoose models, where Mongoose already enforces schema at the data boundary and where adding a build step costs setup time from an 80-hour budget.

### Decision
Write the **client in TypeScript** under `strict` mode, and the **server in JavaScript** (ES modules) with JSDoc type annotations on service-layer functions.

### Options considered

**Option A — TypeScript client, JavaScript server (chosen)**

| Dimension | Assessment |
|---|---|
| Setup effort | Low — CRA/Vite ships TS support; server needs no build step |
| Safety where it matters | High — types applied to the most error-prone layer |
| Server iteration speed | Fast — no compile step, direct `node` execution |
| Cost | The API boundary loses compile-time verification |

**Pros:** type safety concentrated where state complexity actually lives; the server runs directly under Node with no transpilation, keeping the container simple and stack traces honest; Mongoose schemas already validate the data boundary, so server-side static typing is partly redundant; less build configuration to debug during a summer with limited staff support.
**Cons:** types stop at the network boundary — the client's declared response types are an *assumption* about the server, not a guarantee checked by a compiler; the two halves use different tooling configurations.

**Option B — TypeScript on both sides**

**Pros:** end-to-end type safety; response types could be defined once in a shared package and imported by both, making the API contract compiler-enforced.
**Cons:** requires a server build step, `ts-node` or compiled output in the Docker image, type definitions for Express/Mongoose/Socket.IO, and a shared-package or monorepo setup to actually realise the shared-types benefit. Without that shared package the end-to-end safety is illusory anyway — two independently declared type sets that merely look alike. The setup cost lands squarely in S0–S1, competing with the realtime and testing work that carries more marks.

**Option C — JavaScript on both sides**

**Pros:** simplest possible toolchain, fastest to start, one mental model.
**Cons:** forgoes type safety exactly where the client's seat-state and payload handling would benefit most; refactoring the seat map late in the project becomes riskier.

### Trade-off analysis
The real question is where type safety earns its setup cost. On the client it clearly does: seat state, socket payloads, and role-conditional rendering are where silent shape errors hide. On the server, Mongoose schemas plus integration tests already cover most of what server-side types would catch, so TypeScript there buys less per hour spent.

The honest cost of this split is the **API boundary seam**: the client declares what it expects a response to look like, and nothing verifies that the server agrees. Option B could close that seam — but only with a genuine shared-types package, which is real monorepo work. Rather than pretend the seam does not exist, it is closed deliberately by testing: every endpoint in §C7.1 has an integration test asserting its response shape, so the contract is verified at runtime in CI even though it is not verified at compile time. That is a weaker guarantee than a shared type, and is recorded as such.

### Consequences
- **Easier:** confident client refactoring; no server build step; simpler API container; fast server iteration.
- **Harder:** the API contract must be maintained by discipline and integration tests rather than by the compiler; client response types must be updated by hand whenever an endpoint changes; two tooling configurations to keep lint-clean.
- **Revisit when:** the API surface grows large enough that hand-maintained client types drift from reality — the migration path is to extract shared type definitions into a workspace package and adopt TypeScript server-side incrementally, which JSDoc annotations make cheaper.

### Action items
1. [ ] Enable `strict` in the client `tsconfig.json`; ban `any` on API response types via lint rule.
2. [ ] Define all API response and socket payload types in a single client-side `types/api.ts` so drift has one place to be fixed.
3. [ ] Add `tsc --noEmit` as a CI step (NFR-17).
4. [ ] Assert response shape in the integration test for every endpoint in §C7.1 (NFR-19).
5. [ ] Add JSDoc type annotations to server service-layer functions to preserve editor support and ease any future migration.
6. [ ] Configure ESLint separately for each side (`@typescript-eslint` on the client, base config on the server).

---

## ADR-009: Stripe with PaymentIntents and webhook confirmation

**Status:** ⚠️ **SUPERSEDED by ADR-014** · **Date:** 2026-08-23 · **Deciders:** Developer (sole)

> **Superseded because:** webhooks require a publicly reachable endpoint and the Stripe CLI during local development — an extra process that can fail during a recorded demonstration. ADR-014 replaces push confirmation with **server-side retrieval**, which keeps the security property intact. **The central argument below is not overturned:** the browser must never be the authority on payment success. ADR-014 still obtains status from Stripe over a server-to-server channel using the secret key — it pulls the answer instead of being pushed it.

### Context
The system must take card payment before confirming a seat. Two things must never happen: a customer charged without a seat, or a seat confirmed without payment. Handling card data directly would place the project in PCI-DSS scope, which is neither appropriate nor achievable for coursework. The brief permits no additional backend server or language, so any gateway must be consumed as an HTTPS API from the existing Node.js service.

### Decision
Use **Stripe in test mode** with the **PaymentIntents** flow: card fields rendered by **Stripe Elements** in the browser, the amount computed server-side, and the booking confirmed only on receipt of a **signature-verified `payment_intent.succeeded` webhook**, processed idempotently.

### Options considered

**Option A — Stripe Elements + PaymentIntents + webhook (chosen)**

| Dimension | Assessment |
|---|---|
| PCI scope | Minimal — card data never touches our systems |
| Correctness | Strong — webhook is an authoritative, out-of-band confirmation |
| Complexity | Medium — webhooks, signatures, idempotency, local forwarding |
| Test support | Excellent — test keys, published test cards, Stripe CLI |

**Pros:** card data goes browser → Stripe directly through a Stripe-hosted iframe, so the API and database never see a PAN; the webhook is server-to-server and cannot be forged by a malicious client; test mode plus the Stripe CLI make the whole flow demonstrable on video without real money.
**Cons:** webhooks require a publicly reachable endpoint, which localhost is not (R13); duplicate webhook delivery is normal and must be handled; the flow has more moving parts than a naive client-confirms model.

**Option B — Client-side confirmation only (trust the browser's success callback)**

**Pros:** far simpler; no webhook endpoint, no signature verification, no idempotency.
**Cons:** the client is untrusted. Anyone can call the "payment succeeded" endpoint directly and receive free tickets. **Rejected as insecure** — recorded here because it is the tempting shortcut and the report should show it was considered and rejected on security grounds, not overlooked.

**Option C — Simulated payment (as in v2.x of this document)**

**Pros:** zero third-party dependency; no keys to protect; trivially testable.
**Cons:** demonstrates no real payment integration, no webhook handling, and no idempotency reasoning — all of which are the substance of what makes this feature worth building.

### Trade-off analysis
The decisive property is **who is trusted to say the payment succeeded**. In Option B it is the browser, which is under the attacker's control. In Option A it is Stripe, speaking server-to-server over a signed channel. That difference is the entire security argument, and it justifies the added complexity of webhook handling.

The residual risk is the gap between "Stripe charged the card" and "our database confirmed the seat" (R14). This is handled with three layers: idempotent processing keyed on the Stripe event id so duplicate deliveries are no-ops; a reconciliation job that queries Stripe for succeeded intents with unfulfilled holds, covering a webhook that never arrives; and automatic refund plus admin alert if payment succeeds but seat allocation fails. Perfect distributed atomicity between two systems is not achievable — the goal is that every failure mode is detected and resolves in the customer's favour.

### Consequences
- **Easier:** PCI scope avoided entirely; forged payments impossible; real integration experience demonstrable on video.
- **Harder:** local development needs the Stripe CLI to forward webhooks; every webhook handler must be idempotent; a reconciliation path must exist and be tested; two more secrets to protect.
- **Revisit when:** multi-currency, saved payment methods, or partial refunds are required.

### Action items
1. [ ] Test-mode keys only; `sk_test_…` never leaves the server, `pk_test_…` only in the client.
2. [ ] Compute the amount **server-side** from stored seat prices; never trust an amount from the client.
3. [ ] Pass `holdId` as the Stripe idempotency key when creating the PaymentIntent.
4. [ ] **Not implemented — superseded by ADR-014.** Verify `stripe-signature` on every webhook; reject unverified requests with 400 and log.
5. [ ] **Not implemented — superseded by ADR-014.** Store processed Stripe event ids; make reprocessing a no-op.
6. [ ] **Not implemented — superseded by ADR-014.** Exempt the webhook route from JWT auth and from the JSON body parser (signature verification needs the raw body — a classic and time-consuming bug).
7. [ ] **Not implemented — superseded by ADR-014.** Build the reconciliation job in the same sprint as the webhook, not later — reconciliation *is* implemented, but as part of ADR-014's confirm-driven flow, not a webhook handler.
8. [ ] **Not implemented — superseded by ADR-014.** Use Stripe CLI (`stripe listen --forward-to`) from day one of S5 — no longer needed since there is no webhook to forward.

---

## ADR-010: Nodemailer for email, Notify.lk for SMS, dispatched asynchronously

**Status:** Accepted · **Date:** 2026-08-23 · **Deciders:** Developer (sole)

### Context
The system must send transactional messages: email verification, password reset, booking confirmation, and showtime cancellation. Sri Lankan customers benefit from SMS confirmation, since a booking reference on the phone survives a lost inbox. Both channels depend on external services that will sometimes be slow or down.

### Decision
Use **Nodemailer** over SMTP for email and **Notify.lk** for SMS, both behind adapter interfaces, and dispatch **asynchronously outside the booking transaction**. Email is the authoritative channel; SMS is best-effort.

### Options considered

**Option A — Async dispatch behind adapters (chosen)**

**Pros:** a paid booking is never rolled back because a mail server timed out (O9, R16); adapters mean tests inject fakes and never make real outbound calls; the two channels fail independently; retry logic lives in one place.
**Cons:** a message may be delayed or ultimately lost, so the UI must not promise delivery it cannot guarantee; requires a retry mechanism and a failure log.

**Option B — Synchronous dispatch inside the booking flow**

**Pros:** the API response can state definitively that the email was sent.
**Cons:** couples booking success to third-party availability. A slow SMTP handshake adds seconds to the response; an outage fails the request *after* the card has been charged. **Rejected** — this inverts the priority between money and messaging.

**Option C — Email only, no SMS**

**Pros:** one integration fewer; no SMS credit to manage; no number-format handling.
**Cons:** loses the channel most useful at the cinema door, and forgoes demonstrating a second, differently-shaped integration.

### Trade-off analysis
The governing principle is that **notification is a side effect of a booking, not a precondition for one**. Once the customer's card is charged, the booking exists; messaging is how we tell them, and its failure must be visible to operators without ever being visible to the customer as a failed booking.

SMS is treated as best-effort rather than authoritative because delivery depends on carrier behaviour, number formatting, and account credit — none fully under our control (R17). The UI therefore says the confirmation "has been sent to your email", and never blocks on the SMS result.

### Consequences
- **Easier:** booking flow stays fast and resilient; integrations are trivially mockable; failures isolated.
- **Harder:** delivery is eventual, so a customer may act before the message lands — the confirmation page must show the reference on screen and never rely on the message alone; failed sends need a retry mechanism and an admin-visible log.
- **Revisit when:** volume justifies a proper job queue with persistent retries and dead-lettering.

### Action items
1. [ ] Define `NotificationService` with `sendEmail` and `sendSms`; controllers depend on the interface, never the SDK.
2. [ ] Templates for: verification, password reset, booking confirmation, showtime cancellation.
3. [ ] Retry failed sends with backoff, capped at 3 attempts; log permanent failures with a correlation id.
4. [ ] Never include a password, token value, or card detail in any message body; reset emails carry a single-use link only.
5. [ ] Always display the booking reference on the confirmation page — never rely solely on the message.
6. [ ] Use a capture mailbox (e.g. Mailtrap) in development so no real address is ever emailed during testing.
7. [ ] Normalise Sri Lankan mobile numbers to the gateway's expected format at the adapter boundary, and validate before the demo.

---

## ADR-011: Hashed, single-use, TTL-bound tokens for verification and password reset

**Status:** Accepted · **Date:** 2026-08-23 · **Deciders:** Developer (sole)

### Context
Registration now requires email verification, and users must be able to reset a forgotten password. Both flows work by emailing a link containing a token. These tokens are, for the moment they are valid, equivalent to the account's password — a reset token grants the ability to set a new one. Password reset is also a classic source of user-enumeration leaks.

### Decision
Generate **cryptographically random tokens**, store only a **hash** of each token, make them **single-use** and **short-lived**, and return **identical responses regardless of whether the email exists**.

### Options considered

**Option A — Random token, hashed at rest, single-use, TTL (chosen)**

| Property | Verification token | Reset token |
|---|---|---|
| Entropy | ≥32 random bytes | ≥32 random bytes |
| Storage | SHA-256 hash only | SHA-256 hash only |
| Lifetime | 24 hours | 60 minutes |
| Uses | One | One |
| Invalidated by | Use, or reissue | Use, password change, or reissue |

**Pros:** a database leak yields hashes, not usable tokens — the same reasoning that applies to passwords; a short TTL limits the window if a link is exposed in a forwarded email or shared device; single-use prevents replay (R18).
**Cons:** users who delay past the TTL must request a new link; requires a resend path and clear expiry messaging.

**Option B — Signed JWT as the reset token**

**Pros:** stateless; no database record needed.
**Cons:** a JWT cannot be invalidated before expiry, so it remains usable after the password has already been reset — precisely the replay this decision exists to prevent. **Rejected on correctness.**

**Option C — Short numeric OTP by SMS**

**Pros:** familiar; no email dependency.
**Cons:** low entropy demands strict attempt limiting; costs SMS credit per attempt; adds a channel dependency to account recovery. Reasonable as a future second factor, not as the primary mechanism.

### Trade-off analysis
The core insight is that **a reset token is a password**, so it inherits password-handling rules: never stored in recoverable form, never logged, never placed in a URL that gets recorded server-side beyond what is necessary. Option B's statelessness is attractive precisely until you need to revoke, which is exactly when it fails.

The second concern is **enumeration** (R19). A password-reset endpoint that says "no account with that email" is a membership oracle. The endpoint therefore returns the same message and comparable timing in both cases: *"If an account exists for that address, a reset link has been sent."* The same discipline applies to registration and login.

### Consequences
- **Easier:** a leaked database yields no usable tokens; replay is impossible; enumeration closed off.
- **Harder:** expired links generate support friction, so messaging must be explicit and resending must be easy; verification adds a step between registration and first booking, which will show in UAT completion times.
- **Revisit when:** adding true multi-factor authentication.

### Action items
1. [ ] `crypto.randomBytes(32).toString('hex')` for token generation — never `Math.random`.
2. [ ] Store `tokenHash`, `expiresAt`, `usedAt`; never the raw token.
3. [ ] Compare using a timing-safe comparison.
4. [ ] Invalidate all outstanding reset tokens when a password changes.
5. [ ] Rate-limit verification resend and reset request per email and per IP.
6. [ ] Identical response body and status for existing and non-existing emails on reset request.
7. [ ] Unverified users may log in and manage their profile, but **may not book** — enforced server-side, not merely hidden in the UI.

---

## ADR-012: TTL seat hold spanning the payment window (supersedes ADR-004)

**Status:** Accepted · **Date:** 2026-08-23 · **Deciders:** Developer (sole) · **Supersedes:** ADR-004

### Context
ADR-004 chose an atomic conditional update at the moment of booking, and explicitly rejected a pessimistic hold as unnecessary complexity. That reasoning was sound *for a system with no payment step*. Stripe (ADR-009) changes the premise: the customer now spends seconds — potentially minutes — entering card details between selecting a seat and the payment confirming. Under ADR-004's model the seat stays available throughout that window, so two customers can pay for the same seat and one must be refunded. That is a materially worse outcome than being told up front that a seat is gone.

### Decision
Introduce an explicit **hold** state. Seats move `available → held → booked`, or `held → available` on expiry or abandonment. A hold is created atomically before the PaymentIntent, carries a **10-minute TTL**, and is released by a sweeper if payment does not complete. The hold itself is recorded as its own document in a separate `holds` collection (§C6.2), referenced from the Showtime's embedded seats by `holdRef` — it is not embedded in Booking, since a hold and a booking are different lifecycle stages with different audit requirements (D6).

### Options considered

**Option A — TTL hold across the payment window (chosen)**

**Pros:** the customer entering card details cannot lose the seat mid-payment; conflicts surface at selection time rather than after a charge; refund-and-apologise is eliminated as a routine path; the seat map now shows `held` seats live, which makes the WebSocket feature visibly richer.
**Cons:** introduces a stateful lifecycle needing expiry, a sweeper, and crash recovery; a seat can appear unavailable while a hold is idle; a stuck hold strands inventory (R15).

**Option B — Retain ADR-004: atomic update at payment confirmation**

**Pros:** no lifecycle, no sweeper, no new state.
**Cons:** the losing customer is charged and refunded — an unacceptable routine outcome. Refunds are slow, look like failure to the customer, and create reconciliation work. **Rejected.**

**Option C — Hold with no expiry, released only on explicit cancel**

**Pros:** simplest hold implementation.
**Cons:** any abandoned checkout removes a seat permanently. A single closed browser tab makes a seat unsellable. **Rejected as operationally unsound.**

### Trade-off analysis
The complexity ADR-004 declined is now justified — not because the earlier reasoning was wrong, but because the premise changed. This is worth stating plainly in the report: an architectural decision is correct relative to its constraints, and revisiting it when constraints change is the process working, not a mistake being corrected.

The chief risk is stranded inventory (R15), mitigated in depth: an application-level sweeper every 60 seconds, and — decisively — every read of seat state treating a hold with `holdExpiresAt < now` as available regardless of stored status, so a lagging or dead sweeper can never cause a seat to appear taken when it is not. That last property matters most — correctness does not depend on a background job running on time.

**No TTL index on the `holds` collection.** Unlike `revokedtokens` and `ratelimits` (ADR-013 Option D), the `holds` collection deliberately carries **no** MongoDB TTL index. Deleting an expired hold would destroy the very record the reconciliation job (FR-39) needs to read — a hold that expired after a successful payment is exactly the case reconciliation must find and complete. A hold is therefore never removed automatically; it is only ever transitioned between `active`, `released`, and `consumed` (§C6.2).

Ten minutes is chosen as long enough to enter card details unhurried, short enough that an abandoned checkout does not block a seat through a busy screening slot. The client displays a visible countdown so the constraint is never a surprise.

### Consequences
- **Easier:** no routine refunds; conflicts surface early; a richer, more demonstrable realtime seat map.
- **Harder:** three seat states instead of two; a sweeper to run and monitor; crash-recovery reasoning; a countdown UI and expiry handling on the client.
- **Revisit when:** contention rises enough that 10 minutes is too generous, or a queue system becomes warranted for high-demand releases.

### Action items
1. [ ] Add `held` to the seat status enum, with `holdRef` and `holdExpiresAt`; create the corresponding document in the separate `holds` collection (§C6.2).
2. [ ] Create holds via the same atomic conditional update technique retained from ADR-004.
3. [ ] Sweeper every 60s releasing expired holds and broadcasting `seats:updated`.
4. [ ] **Every read treats an expired hold as available**, independent of the sweeper.
5. [ ] Broadcast hold and release events so other clients see seats grey out live.
6. [ ] Client shows a countdown; on expiry, clear selection and re-fetch.
7. [ ] Concurrency test: 50 simultaneous holds on one seat → exactly one success.
8. [ ] Crash test: kill the API mid-hold, restart, confirm the seat frees at expiry.
9. [ ] **Do not add a TTL index to `holds`.** Add a code comment at the schema definition stating why (reconciliation, FR-39), so a future change does not quietly reintroduce one.

---

## ADR-013: MongoDB TTL collections for shared ephemeral state — Option D (amends ADR-006)

**Status:** Accepted — **Option D** · **Date:** 2026-08-23 · **Deciders:** Developer (sole) · **Amends:** ADR-006

> **History note:** an earlier revision of this record (v3.1) chose Redis (then labelled "Option A") for this same problem, superseding ADR-006's no-cache position. That choice was never implemented past the planning stage and is **replaced** by this revision. Redis's compliance risk (R20, retired) has proved decisive against it; Option D below is now the only decision this ADR records. It **amends** ADR-006 rather than superseding it, because it reaffirms — rather than reopens — ADR-006's core position that no caching layer exists anywhere in the system.

### Context

ADR-006 declined a cache, and its central argument was sound: caching **seat state** would serve stale availability and undermine the correctness guarantee the whole system rests on. That argument still holds and is preserved below, strengthened rather than weakened by this ADR.

Separately, the system has acquired **three** pieces of state that are ephemeral, shared, and awkward to hold in process memory alone:

1. **Rate-limit counters** (FR-10, FR-18, NFR-6). Currently in-process, which means they reset on every deploy and would not be shared if a second instance were ever added. An attacker can defeat an in-memory limiter by waiting for a restart.
2. **Token revocation** (FR-15). The requirement states that resetting a password invalidates all existing sessions. **Stateless JWT cannot do this** — ADR-005 explicitly accepted "no revocation before expiry" as a known weakness. As written, v3.0 promised behaviour the architecture could not deliver. This ADR closes that gap.
3. **Short-lived operational safety** — preventing the reconciliation job and a returning client from double-processing the same hold. This does not need a separate store: it is handled by the same atomic, conditional writes already used for seat holds (ADR-012) and idempotent confirmation (the unique index on `bookings.paymentIntentId`, ADR-014), so no new ephemeral mechanism is introduced for it.

(Socket.IO cross-instance broadcast — the fourth candidate considered in earlier drafts — is **not** in this list: horizontal scaling of the WebSocket layer is explicitly out of scope, §A4.2, so there is no cross-instance broadcast problem to solve.)

Catalogue read latency, considered as a secondary benefit in earlier drafts, is **not** a driver here: at the estimated ~25 req/s (§A7), NFR-2's read-latency target is already met by the indexes in §C6.3 without any cache.

### Decision

Solve both problems in **MongoDB**, with two dedicated TTL collections — no second datastore of any kind:

| Collection | Holds | TTL index on | Closes |
|---|---|---|---|
| `revokedtokens` | Revoked JWT ids (`jti`), keyed by user and issued-at | `expiresAt` = remaining token lifetime | FR-15 (session revocation) |
| `ratelimits` | Attempt counters per email/IP and per time window | `expiresAt` = window end | NFR-6 (rate limits survive a restart) |

**Read-time correctness rule (load-bearing):** a TTL index is a background *reaper* that runs on its own schedule (MongoDB documents it as typically within 60 seconds of expiry, not instantly). Every read of `revokedtokens` or `ratelimits` therefore treats a row whose `expiresAt` has passed as **already absent**, regardless of whether the reaper has physically deleted it yet. Correctness never depends on reaper timing — exactly the same discipline ADR-012 applies to seat holds.

**Explicitly not reintroduced:**

- **No catalogue cache.** Films, cinemas, and showtime metadata are read directly from MongoDB via the §C6.3 indexes. This is a deliberate loss of a secondary benefit considered in earlier drafts, not an oversight — see Trade-off analysis.
- **Seat availability, holds, and booked status** are still never cached anywhere, under any option. ADR-006's prohibition is unchanged and absolute.
- Booking records, payment status, user accounts, and auth tokens remain uncached, as before.

**MongoDB remains the sole system of record and the sole datastore of any kind.** Everything in `revokedtokens` and `ratelimits` is ephemeral, derived, and reconstructible by discarding it; nothing in either collection is authoritative over anything durable.

### Options considered

| Dimension | Option A — Redis (rate limit + revocation + catalogue cache) | Option B — status quo (in-process only) | Option C — Redis for catalogue cache only | **Option D — MongoDB TTL collections (chosen)** |
|---|---|---|---|---|
| Solves FR-15 revocation | Yes | No | No | **Yes** |
| Solves NFR-6 restart-surviving rate limits | Yes | No | No | **Yes** |
| Catalogue read latency | Improved | Unchanged | Improved | Unchanged (already meets NFR-2 via §C6.3) |
| New datastore introduced | Yes — Redis | No | Yes — Redis | **No** |
| Coursework compliance risk | **High — "other types of database are not permitted" (R20)** | None | **High**, for the least value of any option | **None** |
| Write cost | Low (in-memory) | N/A | Low (in-memory) | Moderate — every auth attempt is a small Mongo write |
| Complexity | A fourth service to run, secure, monitor | None | A fourth service, for one problem | Two schemas and two TTL indexes; no new service |

**Pros of Option D:** delivers FR-15 and NFR-6, the two capabilities that actually justify solving this problem at all; introduces no new service, connection string, or secret; the compliance question raised by every Redis-based option simply does not arise, since MongoDB was already the sole permitted datastore.
**Cons of Option D:** a small write on every auth attempt is a less natural fit for MongoDB than for an in-memory store; catalogue caching, and the Socket.IO cross-instance scaling path Redis would have unlocked, are both given up — the former was only ever a secondary benefit, and the latter was already out of scope.

### Trade-off analysis

The decisive factor is the **compliance argument**, not a performance one. The brief states plainly that "other types of database are not permitted," and every Redis-based option (A and C) carries a real, previously-recorded risk (R20) that an assessor reads Redis as exactly that — a second database — regardless of how carefully it is scoped to "infrastructure, not data." Option D removes the argument entirely rather than winning it: MongoDB was always the sole permitted datastore, and Option D keeps it that way while still closing FR-15 and NFR-6.

Catalogue caching is consciously **dropped as a lost secondary benefit**, not preserved by another means. It was never the reason Redis was considered in earlier drafts — FR-15 and NFR-6 were — and NFR-2's read-latency target is already met by the §C6.3 indexes without it, so nothing currently in scope is actually lost.

The residual cost is write volume on `ratelimits`: a small MongoDB write per auth attempt, versus an in-memory increment. At the estimated login/reset volume (§A7) this is not a measured problem, and it buys restart-surviving rate limits, which an in-process counter cannot provide at any cost.

### Consequences

- **Easier:** FR-15 and NFR-6 become deliverable; no fourth service to run, secure, or monitor; no new secret; the compliance question is closed rather than merely mitigated; one datastore to back up, monitor, and reason about.
- **Harder:** rate-limit writes add a small amount of MongoDB write load absent from an in-memory counter; catalogue caching and the Socket.IO scaling path are given up (both judged acceptable — see Trade-off analysis); every read path must apply the read-time correctness rule rather than trusting collection contents at face value.
- **Revisit when:** catalogue read latency is *measured* (not assumed) to exceed NFR-2's target, or rate-limit write volume is measured to strain the shared-tier Atlas cluster — at which point a purpose-built in-memory store becomes a live discussion again, subject to the same compliance question this ADR closes.

### Action items

1. [ ] Create the `revokedtokens` collection: `{jti, userRef, expiresAt}`, TTL index on `expiresAt`.
2. [ ] Create the `ratelimits` collection: `{key, windowStart, count, expiresAt}`, TTL index on `expiresAt`.
3. [ ] **Read-time correctness:** every lookup against `revokedtokens` or `ratelimits` treats a row with `expiresAt < now` as absent, never trusting that the TTL reaper has already removed it.
4. [ ] Add `jti` to issued JWTs; check `revokedtokens` in auth middleware.
5. [ ] On password reset and on logout-all, insert the user's outstanding `jti` values into `revokedtokens` with `expiresAt` equal to the token's own remaining lifetime.
6. [ ] Implement rate limiting as windowed counters in `ratelimits`, keyed by email and by IP, incremented atomically (`$inc` with upsert).
7. [ ] Do **not** reintroduce a catalogue cache; if read latency ever motivates one, revisit this ADR rather than adding it silently.
8. [ ] Remove `REDIS_URL`, `ioredis`, and `ioredis-mock` from the secrets inventory (§A6.4), `.env.example`, dependencies, and test setup.
9. [ ] Unit-test the read-time correctness rule directly: a row with a past `expiresAt` still present in the collection (reaper not yet run) must still be treated as absent.

---


## ADR-014: Server-side PaymentIntent retrieval instead of webhooks (supersedes ADR-009)

**Status:** Accepted · **Date:** 2026-08-23 · **Deciders:** Developer (sole) · **Supersedes:** ADR-009

### Context

ADR-009 confirmed bookings from a signed `payment_intent.succeeded` webhook. Its security argument was correct and is preserved: **the browser must never be the authority on whether payment succeeded.**

Webhooks carry an operational cost, however. They require a publicly reachable endpoint, which a development machine is not, so local work depends on the Stripe CLI forwarding events (R13). During a five-minute assessed demonstration video, that is one more process that can fail on camera, and a failure would be indistinguishable from a broken payment flow to a viewer.

The question this record settles is therefore **not** "webhook or trust the client" — that was answered in ADR-009 and the answer has not changed. It is: *is there another server-to-server way to obtain authoritative payment status that does not require an inbound endpoint?*

There is. Stripe's API allows the server to **retrieve** a PaymentIntent by id using the secret key and read its status directly.

### Decision

Confirm bookings by **server-side retrieval**. After the customer completes payment in Stripe Elements, the client asks the server to *check* the hold. The server then calls `stripe.paymentIntents.retrieve(...)` with its **secret key**, verifies status, amount, currency, and metadata itself, and only then allocates seats.

**The client is trusted for nothing.** It supplies a `holdId` and triggers a check; it never asserts an outcome. Stripe remains the authority — the difference from ADR-009 is only that the server *pulls* the answer instead of being *pushed* it.

**Verification steps the server performs before allocating any seat:**

1. The hold exists, belongs to the authenticated user, and has not expired.
2. `paymentIntent.status === 'succeeded'`.
3. `paymentIntent.amount` **exactly equals** the amount recomputed server-side from stored seat prices.
4. `paymentIntent.currency` matches the expected currency.
5. `paymentIntent.metadata.holdId` matches the requested hold — preventing a valid PaymentIntent from one booking being replayed against another.

Failing any check aborts allocation and logs a security event.

### Options considered

**Option A — Server-side retrieval (chosen)**

| Dimension | Assessment |
|---|---|
| Security | Strong — server-to-server, secret key, client asserts nothing |
| Operational complexity | Low — no inbound endpoint, no signature verification, no CLI |
| Demo reliability | High — nothing external to keep running on camera |
| Weakness | Confirmation depends on the client returning; abandoned tabs need reconciliation |

**Pros:** no public endpoint, no webhook signing secret to protect, no raw-body parser trap; the flow is entirely outbound, so it works identically on a laptop and in production; one fewer process during the demonstration.
**Cons:** if the customer closes the tab immediately after paying, no one tells the server, so the booking is not created until reconciliation runs; retrieval adds a round trip to Stripe on the confirmation path.

**Option B — Webhook (ADR-009, superseded)**

**Pros:** Stripe pushes the result, so confirmation does not depend on the client returning at all; the most robust option in production.
**Cons:** needs a public endpoint and the Stripe CLI locally (R13); signature verification requires the raw body, a classic silent-failure bug; an extra secret; an extra thing to fail during a recorded demo.

**Option C — Trust the client's `confirmPayment()` result**

**Pros:** trivial.
**Cons:** the browser is under the attacker's control. A crafted request to the confirmation endpoint yields free tickets. **Rejected — as in ADR-009, and for the same reason.** Recorded again here because the change to retrieval could easily be mistaken for this, and it is not.

### Trade-off analysis

The security property that mattered in ADR-009 is fully retained: **payment status comes from Stripe over an authenticated server-to-server channel, never from the browser.** Push and pull are equally trustworthy here; only the direction differs.

What is genuinely lost is **push reliability**. A webhook arrives whether or not the customer's browser survives; retrieval only happens if something asks. The failure mode is a customer charged with no booking created — the worst outcome in the system.

This is mitigated by making **reconciliation mandatory rather than a backstop**. Under ADR-009 the reconciliation job covered a rare missed webhook; under this decision it covers an ordinary event — a closed tab — and is therefore promoted from a "should" to a core requirement, running every two minutes rather than occasionally. Any hold with a succeeded PaymentIntent and no booking is fulfilled automatically, and the customer receives their confirmation email as normal, just slightly later.

Idempotency remains essential and gets simpler: a **unique index on `bookings.paymentIntentId`** means a second confirmation attempt — whether from a client retry, a double-click, or the reconciliation job racing the client — cannot produce a second booking. The duplicate write fails at the database and the existing booking is returned instead.

This trade is acceptable for coursework, where demonstrability has real value and volume is low. It would be the wrong trade for a production ticketing platform, and the report should say so.

### Consequences

- **Easier:** no public endpoint, no signature verification, no webhook secret, no CLI dependency, no raw-body trap; the demo has fewer moving parts.
- **Harder:** an abandoned tab now depends on reconciliation, so that job must exist, run frequently, and be tested — it is no longer optional; confirmation adds a Stripe round trip.
- **Revisit when:** the system goes anywhere near production, or payment volume makes a two-minute reconciliation window unacceptable. Webhooks are the correct production answer and ADR-009 should be reinstated.

### Action items

1. [ ] `POST /api/bookings/confirm` accepts **only** `{holdId}`. It must not accept an amount, a status, or a `paymentIntentId` from the client.
2. [ ] Server retrieves the PaymentIntent using the **secret key**; the publishable key never confirms anything.
3. [ ] Verify all five conditions above before allocating; abort and log on any mismatch.
4. [ ] Unique index on `bookings.paymentIntentId` for idempotency; on duplicate-key error, return the existing booking with 200.
5. [ ] Reconciliation job every 2 minutes: for each hold with a succeeded PaymentIntent and no booking, complete the booking and notify.
6. [ ] Remove `STRIPE_WEBHOOK_SECRET` from the secrets inventory. No webhook-event model is introduced anywhere in this system — there is no inbound webhook route to deduplicate events for (D7); idempotency is achieved entirely by the unique index on `bookings.paymentIntentId` (action item 4 below).
7. [ ] Test that a forged confirm request for another user's hold is rejected (403).
8. [ ] Test that a confirm request for a PaymentIntent whose amount differs from the server-computed total is rejected.
9. [ ] Test the abandoned-tab path: pay, never call confirm, assert reconciliation creates the booking.
10. [ ] Record in the report why webhooks were not used and what was traded away — this is a good Evaluation talking point.

---

# Part C — Software Requirements Specification

*Structured to IEEE-830 conventions.*

## C1. Introduction

### C1.1 Purpose
This SRS specifies the functional and non-functional requirements for Encore Cinemas, baselining system behaviour before implementation. It is the reference against which design, implementation, and testing are validated.

### C1.2 Scope
As defined in §A4. Encore Cinemas is a distributed cinema booking system: a React/TypeScript client, a Node.js/JavaScript API, MongoDB Atlas storage, a WebSocket channel for realtime seat state, Stripe for payment, and Nodemailer/Notify.lk for notification.

### C1.3 Definitions and abbreviations

| Term | Meaning |
|---|---|
| Film | A motion picture in the catalogue (formerly referred to as "Movie" in early drafts; renamed for consistency with cinema-industry terminology — D1) |
| Cinema | A physical venue containing one or more screens |
| Screen | An auditorium within a cinema, with a fixed seat layout |
| Showtime | A specific film screening on a specific screen at a specific time |
| Seat state | One of `available`, `held`, `booked` |
| Seat tier | The fixed section a seat belongs to — `STANDARD` (×1.00), `PREMIUM` (×1.35), or `RECLINER` (×1.80) — multiplying a showtime's `basePrice` to give that seat's actual price, frozen at showtime creation (D8). Distinct from dynamic/surge pricing, which is out of scope (§A4.2) |
| Hold | A time-limited reservation of seats during checkout, recorded as its own document (not embedded in Booking — D6) with no TTL index (ADR-012) |
| PaymentIntent | Stripe's server-created object representing an intended payment |
| Idempotent | Safe to process more than once with the same result |
| TOCTOU | Time-of-check-to-time-of-use race condition |

### C1.4 References
IEEE Std 830; PUSL3120 assessment brief; Encore Design System v1.0; Frontend Build Specification v1.0; ADR-001 to ADR-014.

## C2. Overall description

### C2.1 Product perspective
A new, self-contained system: three deployable tiers (client container, API container, managed Atlas cluster), one realtime channel, and three outbound integrations. **No inbound webhook endpoint is required** (ADR-014); the legacy webhook route has been removed (D7).

### C2.2 Product functions
Account management with email verification and password reset; film and showtime browsing; interactive seat selection with live availability; time-limited seat holds; card payment via Stripe; booking confirmation by email and SMS; booking history and cancellation; admin management of films, cinemas, screens, showtimes, and bookings.

### C2.3 Operating environment
Modern evergreen browsers (client); Node.js LTS runtime (server), containerised via `docker-compose`; MongoDB Atlas managed replica set over TLS. The API requires outbound access to Atlas, Stripe, SMTP, and Notify.lk. **No publicly reachable inbound endpoint is required**, since all Stripe traffic is outbound (ADR-014).

### C2.4 Design and implementation constraints
React frontend in TypeScript; Node.js-only backend in JavaScript (ADR-008); MongoDB-only database; WebSockets mandatory; distributed across containers; no other server or language permitted. Third-party SaaS APIs are consumed over HTTPS and introduce no additional application server (§A4.3).

## C3. Actors

| Actor | Description | Authentication | May book? |
|---|---|---|---|
| Visitor | Unauthenticated; browses films and showtimes, registers | None | No |
| Unverified registrant | Registered but email not yet verified | JWT, `emailVerified: false` | **No** |
| Customer | Verified user | JWT, role `customer` | Yes |
| Administrator | Manages catalogue and bookings | JWT, role `admin` | Yes |
| Stripe (external authority) | Queried by the server for authoritative payment status | Secret key, server-to-server | n/a |

## C4. Functional requirements

MoSCoW prioritised (M/S/C). Each requirement is atomic, testable, and carries an acceptance criterion.

### C4.1 Registration and email verification

| ID | Pri | Requirement | Acceptance criterion |
|---|---|---|---|
| FR-1 | M | A visitor can register with name, email, phone, password | Password stored as bcrypt hash; plaintext never persisted or logged |
| FR-2 | M | Registration sends a verification email containing a single-use link | Email dispatched async; token stored hashed with 24h TTL |
| FR-3 | M | Following a valid verification link marks the account verified | `emailVerified` set true; token marked used and unusable again |
| FR-4 | M | An expired or already-used verification link is rejected with a clear message and a resend option | 400 with actionable message; no account state change |
| FR-5 | M | A user can request a new verification email | Previous outstanding tokens invalidated; rate-limited per email and IP |
| FR-6 | M | An unverified user cannot create a booking | Server returns 403 `EMAIL_NOT_VERIFIED`; enforced server-side, not merely hidden in UI |
| FR-7 | S | Registration does not reveal whether an email is already registered | Response and timing indistinguishable from a new registration |

### C4.2 Login and session

| ID | Pri | Requirement | Acceptance criterion |
|---|---|---|---|
| FR-8 | M | A registered user can log in | Valid credentials return a signed JWT with role and verification status |
| FR-9 | M | Invalid credentials are rejected without revealing which field was wrong | Generic 401; identical response for unknown email and wrong password |
| FR-10 | M | Login attempts are rate-limited | Repeated failures throttled per email and per IP; 429 `RATE_LIMITED` |
| FR-11 | M | Protected routes reject requests without a valid JWT | Missing, expired, or tampered token returns 401 |
| FR-12 | M | Role-based authorisation is enforced server-side | Customer calling an admin route receives 403 |

### C4.3 Password reset

| ID | Pri | Requirement | Acceptance criterion |
|---|---|---|---|
| FR-13 | M | A user can request a password reset by email | Response identical whether or not the account exists (FR-16) |
| FR-14 | M | A reset email contains a single-use link valid for 60 minutes | Token stored hashed; `usedAt` recorded on use |
| FR-15 | M | A valid reset link allows setting a new password | New password bcrypt-hashed; all outstanding reset tokens invalidated; **all existing JWT sessions invalidated via a `jti` entry written to the `revokedtokens` TTL collection** (ADR-013 Option D) — a token issued before the reset is rejected afterwards |
| FR-16 | M | The reset endpoint does not disclose account existence | Same body, status, and comparable timing in both cases |
| FR-17 | M | An expired or used reset token is rejected | 400 with a clear message and a link to request a new one |
| FR-18 | S | Reset requests are rate-limited per email and IP | Excess requests return 429 |

### C4.4 Films, cinemas, screens, showtimes

| ID | Pri | Requirement | Acceptance criterion |
|---|---|---|---|
| FR-19 | M | Any user can browse films currently showing | Returns films with at least one future showtime |
| FR-20 | M | Any user can view a film's detail and its showtimes | Includes synopsis, certificate, runtime, cinema, screen, time, and price broken down by seat tier (STANDARD/PREMIUM/RECLINER, D8) |
| FR-21 | S | A user can filter showtimes by cinema, date, and time | Filters narrow results correctly and combine |
| FR-22 | M | An admin can perform full CRUD on films | Create, read, update, delete all persist and are reflected in listings |
| FR-23 | M | An admin can perform full CRUD on cinemas and their screens | Screen seat layout defined on creation; deletion blocked if showtimes reference it |
| FR-24 | M | An admin can perform full CRUD on showtimes | Showtime derives its seat array from the screen layout, freezing each seat's actual price from its section's tier multiplier (STANDARD ×1.00 / PREMIUM ×1.35 / RECLINER ×1.80, D8) at creation time; start time must be future |
| FR-25 | S | Cancelling a showtime cancels its bookings and notifies affected customers | Bookings marked cancelled; email and SMS dispatched; refunds initiated |

### C4.5 Seat map, holds, and realtime

| ID | Pri | Requirement | Acceptance criterion |
|---|---|---|---|
| FR-26 | M | A showtime page displays a seat map with per-seat state and seat tier | Available, held, selected, and booked are visually and textually distinct; STANDARD/PREMIUM/RECLINER sections are visually and textually distinct from each other (D8), independent of any dynamic/surge pricing display |
| FR-27 | M | Selecting seats and proceeding creates a time-limited hold | Seats move to `held` with a 10-minute TTL and a hold reference |
| FR-28 | M | A hold or booking on one client updates all other clients viewing that showtime | Change visible within 1s (p95) with no refresh |
| FR-29 | M | Concurrent attempts to hold the same seat are prevented | Under 50 simultaneous requests, exactly one succeeds; others receive 409 |
| FR-30 | M | Expired holds release their seats automatically | Seats return to `available` and the change is broadcast |
| FR-31 | M | A seat whose hold has expired is treated as available on read | Independent of sweeper timing (ADR-012) |
| FR-32 | S | The client displays a countdown for an active hold | Countdown visible; on expiry, selection clears and state re-fetches |
| FR-33 | S | A reconnecting client sees correct seat state | Client re-fetches authoritative state on reconnect rather than trusting cache |

### C4.6 Payment

| ID | Pri | Requirement | Acceptance criterion |
|---|---|---|---|
| FR-34 | M | The system creates a Stripe PaymentIntent for a held selection | Amount computed **server-side** from stored seat prices; a client-supplied amount is ignored |
| FR-35 | M | Card details are collected via Stripe Elements | No card data reaches the Encore client bundle, API, or database |
| FR-36 | M | A booking is confirmed only after the **server** retrieves the PaymentIntent from Stripe and verifies it succeeded | Client-supplied status, amount, or PaymentIntent id are never accepted; a confirm request whose payment did not succeed is rejected |
| FR-37 | M | Confirmation is idempotent | Calling confirm twice for the same hold creates exactly one booking; unique index on `paymentIntentId` enforces this |
| FR-38 | M | A failed payment leaves the hold intact until expiry | User may retry with another card without losing the seats |
| FR-39 | **M** | A reconciliation job completes bookings for succeeded payments whose confirm call never arrived | Runs every 2 minutes; a customer who pays then closes the tab still receives their booking and confirmation (ADR-014) |
| FR-40 | S | Payment succeeding while seat allocation fails triggers refund and admin alert | Booking flagged `allocation_failed`; Stripe refund issued; alert logged |
| FR-40a | M | The confirm endpoint verifies hold ownership, payment status, amount, currency, and hold metadata before allocating | Any mismatch aborts allocation and logs a security event (ADR-014) |
| FR-41 | C | An admin can refund a booking | Refund issued via Stripe; booking marked refunded |

### C4.7 Bookings

| ID | Pri | Requirement | Acceptance criterion |
|---|---|---|---|
| FR-42 | M | A confirmed booking is shown with reference, film, showtime, seats, and total | Booking reference displayed on screen, not only in messages |
| FR-43 | M | A customer can view their own bookings | Returns only the authenticated user's bookings |
| FR-44 | S | A customer can cancel a booking before the showtime | Status cancelled; seats released and broadcast; refund initiated |
| FR-45 | M | An admin can view all bookings, filterable by showtime | Paginated; admin-only |
| FR-46 | S | An admin can view occupancy per showtime | Booked vs total seats displayed |

### C4.8 Notifications

| ID | Pri | Requirement | Acceptance criterion |
|---|---|---|---|
| FR-47 | M | A confirmed booking triggers a confirmation email | Contains reference, film, cinema, screen, time, seats; dispatched async |
| FR-48 | S | A confirmed booking triggers a confirmation SMS | Contains reference and showtime; best-effort, never blocking |
| FR-49 | M | Notification failure never fails or rolls back a paid booking | Booking remains confirmed; failure logged and retried |
| FR-50 | S | Cancelling a showtime notifies affected customers by email and SMS | All affected customers receive both where deliverable |
| FR-51 | M | No password, no card detail, and no token except inside the single-use verification/reset link may ever leave the server in any response or message | Verified by template review and automated test; a verification or reset email legitimately embeds a single-use token in its link, and only there |

**CRUD coverage:** full CRUD for **five** entities — User, Film, Cinema (with Screens), Showtime, Booking — well beyond the required three.

## C5. Non-functional requirements

| ID | Category | Requirement | Target / verification |
|---|---|---|---|
| NFR-1 | Performance | Seat-state updates propagate quickly | ≤1s p95, measured in system test |
| NFR-2 | Performance | API reads respond promptly | p95 <200 ms at 25 req/s |
| NFR-3 | Performance | Booking flow is not blocked by notification | Booking response returns before any message is dispatched |
| NFR-4 | Security | Passwords bcrypt-hashed | Cost ≥10; verified by unit test |
| NFR-5 | Security | Verification and reset tokens random, hashed at rest, single-use, TTL-bound | Verified by unit and integration tests (ADR-011) |
| NFR-6 | Security | Auth endpoints rate-limited using shared state | Throttled per email and IP; counters survive a process restart (ADR-013) |
| NFR-7 | Security | No user enumeration on registration, login, or reset | Identical responses and comparable timing |
| NFR-8 | Security | Payment status is obtained server-to-server, never from the client | Server retrieves the PaymentIntent with the secret key; client claims are never trusted (ADR-014) |
| NFR-9 | Security | No card data in our systems | Stripe Elements only; verified by code review and network inspection |
| NFR-10 | Security | No credentials in source control or client bundle | Only `VITE_`-prefixed public values client-side; repo scanned pre-submission |
| NFR-11 | Security | Input validated and sanitised; no personal data in query strings | Rejection tests for malformed and injected payloads |
| NFR-12 | Reliability | No double-booking under concurrency | Zero duplicates in 50-request test (O7) |
| NFR-13 | Reliability | Payment confirmation idempotent | Repeat confirm calls yield exactly one booking (O8) |
| NFR-14 | Reliability | Expired holds always release | Correctness independent of sweeper timing (FR-31) |
| NFR-15 | Reliability | Third-party outage degrades gracefully | Booking succeeds; notification retried; user sees no error |
| NFR-15a | Reliability | A transient read error against the `revokedtokens`/`ratelimits` TTL collections degrades safely | A rate-limit read error never blocks a legitimate request; a revocation read error never allows a revoked token through (ADR-013 Option D) — there is no separate cache tier to "fall through" from, since both collections live in the primary MongoDB cluster |
| NFR-15b | Correctness | Seat state is never served from any cache | Trivially satisfied — no cache exists anywhere in the system (ADR-013 Option D); verified by code review that the seat-read path has no cache dependency |
| NFR-15c | Correctness | ~~Cached catalogue data is invalidated on write~~ — **WITHDRAWN** | **Withdrawn.** This requirement presupposed a catalogue cache. ADR-013 Option D drops catalogue caching entirely (a lost secondary benefit, not a regression — see ADR-013 Trade-off analysis), so there is no cached catalogue data to invalidate. The number is retained, marked withdrawn, rather than deleted, so historical references to it are not silently orphaned. |
| NFR-16 | Portability | Runs on any Docker host given env vars | `docker-compose up` with populated `.env` works on a clean machine |
| NFR-17 | Maintainability | Layered structure; integrations behind adapters | ESLint zero errors both sides; `tsc --noEmit` clean |
| NFR-18 | Maintainability | Server line coverage ≥70% | Reported by Jest in CI |
| NFR-19 | Correctness | API contract verified despite the language seam | Every endpoint covered by a shape-asserting integration test (ADR-008) |
| NFR-20 | Usability | Seat states, **and seat tiers (STANDARD/PREMIUM/RECLINER, D8)**, are distinguishable without relying on colour alone | Verified in UAT and accessibility check |
| NFR-21 | Accessibility | Keyboard navigable, visible focus, reduced motion respected | Automated axe check plus manual keyboard pass |
| NFR-22 | Privacy | Only necessary personal data collected; never logged | Name, email, phone only; scrubbed from logs |

## C6. Data model

### C6.1 Entity relationships

```
  User ──< Booking >── Showtime ──> Screen ──> Cinema
    │                      │  │
    │                      │  └──> Film
    │                      │
    └──< Hold >────────────┘

  Cinema  1 ──< n  Screen      (screens embedded in cinema)
  Screen  1 ──< n  Showtime
  Film    1 ──< n  Showtime
  User    1 ──< n  Booking
  User    1 ──< n  Hold
  Showtime 1 ──< n Booking
  Showtime 1 ──< n Hold        (a Hold is created before payment; not embedded in Booking — D6)
  Booking  1 ──1  Hold         (Booking.holdRef, unique — the booking a hold eventually produces, if any)
  User    1 ──< n  AuthToken   (verification / reset)
```

### C6.2 Schema definitions

**User**

| Field | Type | Constraints |
|---|---|---|
| `_id` | ObjectId | PK |
| `name` | String | required, 2–80 chars |
| `email` | String | required, unique, lowercase, valid format |
| `phone` | String | required, normalised for Notify.lk |
| `passwordHash` | String | required, bcrypt, never returned by API |
| `role` | String | enum `customer` \| `admin`, default `customer` |
| `emailVerified` | Boolean | default false |
| `createdAt` | Date | auto |

**AuthToken**

| Field | Type | Constraints |
|---|---|---|
| `_id` | ObjectId | PK |
| `userRef` | ObjectId → User | required |
| `type` | String | enum `verify_email` \| `password_reset` |
| `tokenHash` | String | required, SHA-256; raw token never stored |
| `expiresAt` | Date | required; 24h verify, 60min reset |
| `usedAt` | Date \| null | set on use; enforces single use |

**Film**

| Field | Type | Constraints |
|---|---|---|
| `_id` | ObjectId | PK |
| `title` | String | required |
| `synopsis` | String | required |
| `certificate` | String | enum e.g. `U` \| `PG` \| `12A` \| `15` \| `18` |
| `runtimeMinutes` | Number | required, >0 |
| `genre` | [String] | required |
| `posterUrl` | String | optional |
| `releaseDate` | Date | required |

**Cinema** (screens embedded)

| Field | Type | Constraints |
|---|---|---|
| `_id` | ObjectId | PK |
| `name` | String | required |
| `address` | String | required |
| `city` | String | required — needed so email/SMS notification copy can name the cinema's city without a second lookup |
| `screens` | Array of `{id, name, seatLayout[{id,row,number,section}], capacity}` | required, ≤300 seats per screen; `section` enum `STANDARD` \| `PREMIUM` \| `RECLINER` (D8) |

**Showtime** (seats embedded — ADR-002)

| Field | Type | Constraints |
|---|---|---|
| `_id` | ObjectId | PK |
| `filmRef` | ObjectId → Film | required |
| `cinemaRef` | ObjectId → Cinema | required |
| `screenId` | String | required; identifies the embedded screen |
| `screenName` | String | denormalised copy of the screen's name at creation time — lets showtime listings show which screen without populating the ~300-row seat layout |
| `startsAt` | Date | required, future on creation |
| `basePrice` | Number | required, ≥0 — the STANDARD-tier price; PREMIUM and RECLINER prices are derived by multiplier at creation time (D8), not renamed at read time |
| `seats` | Array of `{id, row, number, section, status, price, holdRef, holdExpiresAt}` | `section` enum `STANDARD` \| `PREMIUM` \| `RECLINER`; `price` is `basePrice × tierMultiplier` (STANDARD ×1.00 / PREMIUM ×1.35 / RECLINER ×1.80), frozen per seat at showtime creation so a later tier-multiplier or basePrice change never alters an already-published showtime; `status` enum `available` \| `held` \| `booked` |
| `status` | String | enum `scheduled` \| `cancelled` |

**Hold** (own collection — D6; not embedded in Booking)

| Field | Type | Constraints |
|---|---|---|
| `_id` | ObjectId | PK — this is the `holdId` referenced by seats' `holdRef` and by the client |
| `userRef` | ObjectId → User | required |
| `showtimeRef` | ObjectId → Showtime | required |
| `seatIds` | Array of String | required, non-empty |
| `seatSnapshot` | Array of `{id, section, price}` | required — the seat facts at the moment of holding, so a later showtime edit cannot retroactively change what this hold is worth |
| `totalPrice` | Number | computed server-side from `seatSnapshot`; never trusted from client |
| `amountMinor` | Number | `totalPrice` in Stripe's minor currency unit; the amount actually passed to Stripe |
| `currency` | String | ISO 4217, e.g. `lkr` |
| `paymentIntentId` | String \| null | Stripe reference, set once `POST /api/holds/:id/payment-intent` is called (D12); **unique, sparse index** |
| `status` | String | enum `active` \| `released` \| `consumed` |
| `expiresAt` | Date | required, `createdAt + 10 min` |
| `createdAt` | Date | auto |

**No TTL index on `holds`.** Unlike `revokedtokens` and `ratelimits` (ADR-013 Option D), a hold is never automatically deleted. Deleting an expired hold would destroy the record the reconciliation job (FR-39) needs to read — a hold that expired *after* a successful payment is precisely the case reconciliation exists to find and complete (see ADR-012). Expiry is enforced entirely by application logic: every read treats `status === 'active' && expiresAt < now` as expired regardless of whether a sweeper has processed it yet, mirroring the read-time correctness rule ADR-013 applies to the TTL collections.

**Booking**

| Field | Type | Constraints |
|---|---|---|
| `_id` | ObjectId | PK |
| `reference` | String | unique, human-readable (e.g. `ENC-4471`) |
| `userRef` | ObjectId → User | required |
| `showtimeRef` | ObjectId → Showtime | required |
| `holdRef` | ObjectId → Hold | required, **unique** — the hold this booking was produced from; a hold can produce at most one booking |
| `seats` | Array of seat ids | required, non-empty |
| `totalPrice` | Number | computed server-side; never trusted from client |
| `paymentIntentId` | String | Stripe reference; **unique index** enforces idempotent confirmation |
| `paymentStatus` | String | enum `pending` \| `paid` \| `refunded` \| `allocation_failed` |
| `status` | String | enum `confirmed` \| `cancelled` |
| `createdAt` | Date | auto |


### C6.3 Indexes

| Collection | Index | Purpose |
|---|---|---|
| users | `{email: 1}` unique | Login; enforces uniqueness |
| authtokens | `{tokenHash: 1}` unique | Token lookup |
| authtokens | `{expiresAt: 1}` TTL | Automatic cleanup of expired tokens |
| films | `{title: "text", synopsis: "text"}` | Free-text search (FR-21) |
| films | `{genre: 1}` | Filter by genre (FR-21) |
| showtimes | `{startsAt: 1, status: 1}` | Upcoming listings (FR-19) |
| showtimes | `{filmRef: 1, startsAt: 1}` | Showtimes for a film (FR-20) |
| showtimes | `{cinemaRef: 1, startsAt: 1}` | Filter by cinema (FR-21) |
| holds | `{userRef: 1, status: 1}` | A user's active holds |
| holds | `{showtimeRef: 1, status: 1, expiresAt: 1}` | Sweeper query (FR-30) — reads the `holds` collection directly (see note below) |
| holds | `{paymentIntentId: 1}` **unique, sparse** | Reconciliation lookup by PaymentIntent; sparse because most holds never reach payment |
| bookings | `{userRef: 1, createdAt: -1}` | My bookings (FR-43) |
| bookings | `{showtimeRef: 1}` | Admin per-showtime view (FR-46) |
| bookings | `{reference: 1}` unique | Reference lookup |
| bookings | `{paymentIntentId: 1}` **unique** | Reconciliation lookup **and idempotency guard** (FR-37) — a duplicate confirm cannot create a second booking |
| bookings | `{holdRef: 1}` **unique** | Enforces that a hold produces at most one booking |
| revokedtokens | `{jti: 1}` unique | Revocation lookup in auth middleware (ADR-013 Option D) |
| revokedtokens | `{expiresAt: 1}` TTL | Automatic cleanup once the token would have expired anyway |
| ratelimits | `{key: 1, windowStart: 1}` unique | Atomic per-window counter lookup and increment (ADR-013 Option D) |
| ratelimits | `{expiresAt: 1}` TTL | Automatic cleanup of expired windows |

**`films` text index — corrected.** An earlier draft specified `{title: "text", genre: 1}` on one compound index. This is invalid: MongoDB does not permit a text index component alongside a non-text component that indexes a multikey (array) field, and `genre` is `[String]`. The fix splits it into two separate indexes: a text index over `title` and `synopsis`, and a plain ascending index over `genre`.

**`showtimes {"seats.holdExpiresAt": 1}` — dropped.** An earlier draft indexed the embedded seat array for the sweeper query. Now that Hold is its own collection (D6), the sweeper queries `holds` directly (`{status: 'active', expiresAt: {$lt: now}}`, served by the index above) rather than scanning every showtime's seat array. Keeping a multikey index over up to 300 array elements per showtime would tax every hold-related write on that showtime for a reader that no longer exists — the index is dropped rather than retained "just in case".

## C7. Interface specifications

### C7.1 REST API contract

All responses JSON. State-changing routes require `Authorization: Bearer <jwt>` unless noted.

**Authentication**

| Method | Endpoint | Auth | Body | Success | Errors |
|---|---|---|---|---|---|
| POST | `/api/auth/register` | — | `{name, email, phone, password}` | **202 `{message}`** — no token; the account exists but is unverified (D14) | 400, 429 |
| POST | `/api/auth/verify-email` | — | `{token}` | 200 `{verified: true}` | 400 invalid/expired/used |
| POST | `/api/auth/resend-verification` | Any | — | 202 (always) | 429 |
| POST | `/api/auth/login` | — | `{email, password}` | 200 `{user, token}` | 401, 429 |
| POST | `/api/auth/forgot-password` | — | `{email}` | 202 (always, regardless of existence) | 429 |
| POST | `/api/auth/reset-password` | — | `{token, password}` | 200 | 400 invalid/expired/used |

**Login is the only token issuer (D14).** Registration returns `202 {message}` with no JWT — an unverified, unauthenticated account cannot yet do anything a token would be needed for, and issuing one at registration only to reject its use everywhere except `/api/auth/verify-email` invited confusion. A JWT is issued exclusively by `POST /api/auth/login`.

**Users**

| Method | Endpoint | Auth | Success | Errors |
|---|---|---|---|---|
| GET | `/api/users/me` | Customer | 200 `{user}` | 401 |
| PATCH | `/api/users/me` | Customer | 200 `{user}` | 400, 401, 409 |
| DELETE | `/api/users/me` | Customer | 204 | 401 |

**Catalogue**

| Method | Endpoint | Auth | Success | Errors |
|---|---|---|---|---|
| GET | `/api/films` | — | 200 `{items, total, page, limit}` | 400 |
| GET | `/api/films/:id` | — | 200 `{film, showtimes[]}` | 404 |
| POST/PATCH/DELETE | `/api/films/:id?` | Admin | 201/200/204 | 400, 401, 403, 404 |
| GET | `/api/cinemas` | — | 200 `{items}` | — |
| GET | `/api/cinemas/:id` | — | 200 `{cinema}` (includes `screens[]`, `city`) | 404 `CINEMA_NOT_FOUND` |
| POST/PATCH/DELETE | `/api/cinemas/:id?` | Admin | 201/200/204 | 400, 403, 404, 409 in-use |
| GET | `/api/showtimes` | — | `?filmId&cinemaId&date&page&limit` → 200 | 400 |
| GET | `/api/showtimes/:id` | — | 200 `{showtime, seats[]}` | 404 |
| POST/PATCH/DELETE | `/api/showtimes/:id?` | Admin | 201/200/204 | 400, 403, 404 |

**Holds, payment, bookings**

| Method | Endpoint | Auth | Body | Success | Errors |
|---|---|---|---|---|---|
| POST | `/api/holds` | Verified customer | `{showtimeId, seatIds[]}` | 201 `{holdId, expiresAt, amountMinor, currency}` — **creates the Hold only; makes no Stripe call** (D12) | 400, 401, **403 `EMAIL_NOT_VERIFIED`**, **409 `SEAT_UNAVAILABLE`** |
| POST | `/api/holds/:id/payment-intent` | Verified customer, hold owner | — | 201 `{clientSecret, expiresAt, amount}` — **creates the Stripe PaymentIntent for an existing hold** (D12) | 400, 401, 403 not owner, **404 `HOLD_NOT_FOUND`**, 409 `HOLD_EXPIRED` |
| DELETE | `/api/holds/:id` | Verified customer | — | 204 (seats released) | 401, 403, 404 `HOLD_NOT_FOUND` |
| POST | `/api/bookings/confirm` | Verified customer | **`{holdId}` only** | 200 `{booking}` | 400, 401, **403 not owner**, **402 `PAYMENT_NOT_SUCCEEDED`**, **409 `HOLD_EXPIRED`** |
| GET | `/api/bookings/by-hold/:holdId` | Verified customer | — | 200 `{booking}` / 404 while pending | 401, 403 |
| GET | `/api/bookings/me` | Customer | `?page&limit` | 200 paginated | 401 |
| GET | `/api/bookings/:id` | Customer (own) or Admin | — | 200 `{booking}` | 401, 403 not owner, 404 |
| PATCH | `/api/bookings/:id/cancel` | Customer | — | 200 `{booking}` | 401, 403 not owner, 404, 409 too late |
| GET | `/api/bookings` | Admin | `?showtimeId&page&limit` | 200 paginated | 401, 403 |
| POST | `/api/bookings/:id/refund` | Admin | — | 200 `{booking}` | 403, 404, 409 |
| GET | `/api/admin/stats` | Admin | — | 200 `{bookingsToday, revenueToday, occupancyByShowtime[]}` | 401, 403 |
| GET | `/api/admin/showtimes` | Admin | `?page&limit` | 200 paginated — admin listing including cancelled/past showtimes, unlike the public `GET /api/showtimes` | 401, 403 |
| GET | `/api/health` | — | — | 200 `{status, db, integrations}` | 503 |

**Development-only**

| Method | Endpoint | Auth | Success | Errors |
|---|---|---|---|---|
| GET | `/api/dev/last-mail` | — | 200 `{to, subject, html, text}` — the last email dispatched via the Nodemailer adapter | 404 none sent yet |

`GET /api/dev/last-mail` exists so e2e tests can read a verification or password-reset link without a real mailbox (D13). **It is disabled whenever `NODE_ENV=production`**, returning 404 unconditionally in that environment — the route is not merely undocumented in production, it is inert.

**Removed endpoints**

| Endpoint | Reason removed |
|---|---|
| `POST /api/webhooks/stripe` | Webhooks are removed entirely (D7); confirmation is now server-side PaymentIntent retrieval only (ADR-014). The old handler had no signing-secret verification — a genuine security hole — so it is deleted rather than fixed. |
| `GET/POST /api/events`, `/api/venues`, `/api/artists` (concert domain) | Superseded by `/api/showtimes`, `/api/cinemas`, `/api/films` respectively as part of the cinema-domain migration (D1). |

**Confirm endpoint — security rules (ADR-014).** `POST /api/bookings/confirm` accepts **only** `{holdId}`. The request body is validated with a **strict schema (zod `.strict()`)**: any unexpected field — an `amount`, a payment status, a `paymentIntentId`, or anything else not in the schema — causes the whole request to be **rejected with 400 `VALIDATION_ERROR`**, not silently stripped and ignored. Silently ignoring an unexpected field is a weaker guarantee than rejecting it outright: a client that thinks it is asserting a fact (however futile) should be told its request was malformed, not have that field quietly discarded, since a permissive parser is also the mechanism by which a genuine schema-confusion bug goes unnoticed. The server loads the hold, verifies ownership and expiry, then retrieves the PaymentIntent from Stripe with the **secret key** and independently verifies status, amount, currency, and `metadata.holdId` before allocating a single seat. (§D4.2's integration test for this endpoint is written against this rule — see the note there.)

**No inbound webhook endpoint exists.** All Stripe traffic is outbound, which is why no publicly reachable URL, signature verification, raw-body handling, or webhook secret is required.

**Error envelope** (uniform across all failures):

```json
{ "error": { "code": "SEAT_UNAVAILABLE",
             "message": "One or more selected seats are no longer available.",
             "details": { "seatIds": ["F-12"] } } }
```

**Error codes:** `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `EMAIL_EXISTS`, `EMAIL_NOT_VERIFIED`, `INVALID_TOKEN`, `TOKEN_EXPIRED`, `TOKEN_USED`, `TOKEN_REVOKED`, `SEAT_UNAVAILABLE`, `HOLD_EXPIRED`, `HOLD_NOT_FOUND`, `PAYMENT_FAILED`, `PAYMENT_NOT_SUCCEEDED`, `PAYMENT_AMOUNT_MISMATCH`, `CINEMA_IN_USE`, `CINEMA_NOT_FOUND`, `FILM_NOT_FOUND`, `FILM_IN_USE`, `SCREEN_NOT_FOUND`, `SHOWTIME_NOT_FOUND`, `SHOWTIME_STARTED`, `SHOWTIME_CANCELLED`, `ALLOCATION_FAILED`, `RATE_LIMITED`, `SERVER_ERROR`.

`TOKEN_REVOKED` is distinct from `TOKEN_EXPIRED`: it is returned when a JWT is structurally valid and unexpired but its `jti` is present in `revokedtokens` (ADR-013 Option D) — the FR-15 session-invalidation path. `SHOWTIME_STARTED` and `SHOWTIME_CANCELLED` are returned when an action (hold, booking, cancellation) is attempted against a showtime that has already begun or been cancelled. `FILM_IN_USE` mirrors `CINEMA_IN_USE`: an admin cannot delete a film with existing showtimes. `ALLOCATION_FAILED` is returned to admin-facing views for a booking whose payment succeeded but seat allocation failed (FR-40) — it is a booking state, not a rejection of the current request.

Stack traces and raw driver or Stripe errors are never returned to the client. A payment verification failure returns a generic message; the specific mismatch (amount, currency, metadata) is logged server-side only, so a probing client learns nothing.

### C7.2 WebSocket event catalogue

Namespace `/`. Handshake carries the JWT; unauthenticated sockets may join read-only.

**Room-naming convention.** Two room families exist: `showtime:<id>`, joined by any client (authenticated or not) viewing that showtime's seat map, and `user:<id>`, joined automatically by an authenticated socket's own connection to receive account-specific pushes that are not showtime-scoped. A booking's cancel/refund update, for instance, goes to `user:<id>` because the viewer is not necessarily still looking at that showtime's seat map.

| Direction | Event | Payload | Purpose |
|---|---|---|---|
| Client → Server | `join:showtime` | `{showtimeId}` | Subscribe to seat updates; joins room `showtime:<showtimeId>` |
| Client → Server | `leave:showtime` | `{showtimeId}` | Unsubscribe on navigation |
| Server → Client | `seats:updated` | `{showtimeId, seatIds[], status}` | Broadcast to `showtime:<id>` on hold, release, booking, or cancellation |
| Server → Client | `booking:confirmed` | `{holdId, bookingId, reference}` | Emitted to `user:<id>` when reconciliation completes a booking whose confirm call never arrived (ADR-014); the client resolves a reconciling `?hold=` confirmation against this event |
| Server → Client | `booking:updated` | `{bookingId, status, paymentStatus}` | **New (this amendment).** Emitted to `user:<id>` when a booking's status or payment status changes outside the original confirm flow — cancellation, refund, or an admin-triggered update |
| Server → Client | `showtime:cancelled` | `{showtimeId}` | Admin cancelled the showtime; broadcast to `showtime:<id>` |
| Server → Client | `error` | `{code, message}` | Malformed subscription or auth failure |

Broadcasts are emitted **only after** the database write commits, so no client observes state the server has not persisted.

### C7.3 Third-party integration contracts

Each integration sits behind an adapter interface. **No test makes a real outbound call.**

| Integration | Interface | Failure behaviour |
|---|---|---|
| Stripe | `PaymentService.createIntent(amount, metadata, idempotencyKey)`, **`retrieveIntent(id)`**, `refund(paymentIntentId)`, `listSucceededSince(ts)` | Creation failure → hold released, 502 to client. Retrieval failure → confirm returns 503, hold retained, reconciliation completes it later |
| Email | `NotificationService.sendEmail(to, template, data)` | Retry ×3 with backoff; permanent failure logged with correlation id; **never** blocks or rolls back a booking |
| SMS | `NotificationService.sendSms(phone, message)` | Best-effort; failure logged only; never surfaced to the customer as an error |

### C7.4 Error handling and resilience

| Failure | Detection | Behaviour |
|---|---|---|
| Seat taken between selection and hold | `matchedCount === 0` | 409 with conflicting seat ids; client re-renders from server state |
| Hold expires during payment | `holdExpiresAt < now` | 409 `HOLD_EXPIRED`; client clears selection and re-fetches |
| Payment fails | Stripe returns failure | Hold retained until expiry; user retries with another card |
| Confirm called for another user's hold | Ownership check | 403, logged as a security event; no allocation |
| Confirm where payment not succeeded | Retrieved status ≠ `succeeded` | 402, generic message; no allocation |
| Confirm with amount mismatch | Retrieved amount ≠ server total | Abort, log security event; no allocation |
| Confirm called twice | Duplicate key on `paymentIntentId` | Existing booking returned with 200 |
| **Customer pays then closes tab** | Reconciliation job every 2 min | Booking completed and confirmation sent; `booking:confirmed` emitted |
| Stripe unreachable at confirm | Retrieval throws | 503, hold retained; reconciliation completes it once Stripe is reachable |
| Payment succeeded, allocation failed | Post-write check | Booking flagged, automatic refund, admin alerted |
| Email or SMS fails | Adapter throws | Retried; booking unaffected (O9) |
| Invalid or expired JWT | Verification fails | 401; client clears token and routes to login |
| MongoDB unavailable | Driver error | 503 from health; requests fail fast; no partial writes |
| WebSocket disconnect | Socket.IO `disconnect` | Auto-reconnect with backoff; client **re-fetches** seat state |
| Unhandled error | Global error middleware | Logged with stack and request id; generic 500 to client |

**Retry policy:** the client retries idempotent reads (GET) with exponential backoff up to three attempts. **Hold creation and payment confirmation are never retried automatically** — a blind retry risks a duplicate hold or a double charge. Notifications are retried server-side because they are idempotent from the customer's perspective.

## C8. Traceability — requirements to design

| Requirement | Design element | ADR |
|---|---|---|
| FR-1–7 verification | AuthToken model, NotificationService | ADR-010, ADR-011 |
| FR-8–12 login/session | Auth middleware, rate limiter | ADR-005 |
| FR-13–18 reset | AuthToken model, timing-safe compare | ADR-011 |
| FR-19–25 catalogue | Film/Cinema/Showtime services, indexes | ADR-002 |
| FR-26–33 seat map | Socket gateway, hold lifecycle, sweeper | ADR-003, ADR-012 |
| FR-29 concurrency | Atomic conditional update | ADR-004 (superseded), ADR-012 |
| FR-34–41 payment | PaymentService, retrieval verifier, unique paymentIntentId index, reconciliation job | ADR-009 (superseded), ADR-014 |
| FR-42–46 bookings | Booking service | ADR-002, ADR-012 |
| FR-47–51 notifications | NotificationService adapters | ADR-010 |
| NFR-2 | Indexes (no cache of any kind) | ADR-006 (amended by ADR-013), ADR-013 |
| FR-15 session revocation | JWT `jti` in the `revokedtokens` MongoDB TTL collection | ADR-005, ADR-013 |
| FR-10/18 rate limiting | `ratelimits` MongoDB TTL collection | ADR-013 |
| NFR-19 | Integration shape assertions | ADR-008 |

## C9. Requirements traceability to rubric

| Rubric category | Satisfied by |
|---|---|
| Analysis (10%) | §A2–A5, §C3–C5 — users, benefits, prioritised testable requirements |
| Design (20%) | §A6 component diagram and data flow, §C6–C7 data model and contracts, Part B (14 ADRs) |
| Software (30%) | FR-1–51 — CRUD ×5, WebSockets, holds, payments, notifications, production auth |
| Testing (20%) | Part D — pyramid, coverage targets, four levels, integration mocking strategy |
| CI/CD (10%) | §A9, §D7 |
| Evaluation (10%) | O1–O10, ADR "revisit when" triggers, ADR-004 and ADR-009 supersession narratives, §D8 |

---

# Part D — Test Strategy and Plan

## D1. Testing philosophy

The **testing pyramid**: many fast unit tests over business logic, a middle band of integration tests over the HTTP and database boundary, and few slow, high-confidence end-to-end tests over critical journeys.

```
                    ╱────────────╲
                   ╱   System /   ╲        ~11 tests  slow, high confidence
                  ╱      E2E       ╲
                 ╱──────────────────╲
                ╱    Integration     ╲     ~50 tests  medium speed
               ╱   (API + database)   ╲
              ╱────────────────────────╲
             ╱       Unit tests         ╲  ~100 tests  fast, focused
            ╱   (services, adapters)     ╲
           ╱──────────────────────────────╲

           Plus: usability (UAT) and static analysis alongside
```

An inverted pyramid is slow and brittle; an all-unit suite misses the integration faults that actually break this system. The distribution above is a target, not a prediction.

## D2. What to test — and what not to

**Prioritised:**

- **Business-critical paths** — registration, verification, login, reset, hold, payment, booking, cancellation.
- **Security boundaries** — every authorisation check: unauthenticated, wrong-role, cross-user, and **unverified-user-cannot-book** (FR-6).
- **Data integrity** — concurrency (O7), server-side price computation with frozen tier multipliers (D8), confirmation idempotency (O8), **that the confirm endpoint rejects — not merely ignores — any client-supplied payment fact** (strict schema validation, §C7.1), and the absolute prohibition on cached seat state (no cache of any kind exists, ADR-013 Option D).
- **Token handling** — expiry, single-use, hash-at-rest, invalidation on password change, and the read-time correctness rule for `revokedtokens`/`ratelimits` (a row past `expiresAt` is absent even if not yet reaped).
- **Enumeration resistance** — identical responses for existing and non-existing emails.
- **Error handling** — 409 conflict, hold expiry, strict-schema rejection of an unexpected confirm-body field, third-party failure.
- **Edge cases** — zero seats, already-held seats, past showtimes, expired holds, duplicate confirm calls, paid-but-abandoned holds, empty results, pagination boundaries.

**Deliberately not tested:**

- Mongoose, Express, Stripe SDK internals — third-party code with its own suites.
- Actual email or SMS delivery — adapters are mocked; **no test makes a real outbound call**.
- Stripe's own payment processing — we test our handling of its responses, not Stripe itself.
- MongoDB's own TTL-reaper timing — we test that our read paths never depend on it (the read-time correctness rule), not the reaper's schedule itself.
- Trivial pass-through mappers with no logic.
- Exact CSS values — covered by manual review.

## D3. Coverage targets

| Area | Target | Rationale |
|---|---|---|
| Server overall (line) | ≥70% | NFR-18; enforced in CI |
| Services layer | ≥85% | Where domain logic lives |
| Auth middleware and token service | 100% branch | Security boundary — every path matters |
| Hold and booking service | ≥90% | Highest-risk components (ADR-012) |
| Confirm + reconciliation service | ≥95% | Verification, idempotency, and recovery paths are critical (ADR-014) |
| Client components | ≥60% | Interaction over rendering detail |

Coverage is a floor for confidence, not a goal. The report discusses *what* is covered, not only how much.

## D4. Test levels

### D4.1 Unit tests (Jest)

| Target | Example cases |
|---|---|
| `passwordService` | Bcrypt hash differs per call; verify succeeds only for correct password |
| `tokenService` | Token is ≥32 random bytes; only the hash is stored; expired token rejected; used token rejected; timing-safe comparison used |
| `pricingService` | Total computed from stored seat prices and frozen per-seat tier multipliers (STANDARD ×1.00 / PREMIUM ×1.35 / RECLINER ×1.80, D8); client-supplied amount rejected, not merely ignored; empty selection → 0 |
| `holdService` | Expired hold treated as available regardless of stored status (FR-31); a hold document is never deleted on expiry, only transitioned to `released` |
| `confirmService` | Succeeded intent with matching amount → allocates; wrong status → rejects; amount mismatch → rejects; `metadata.holdId` mismatch → rejects; hold owned by another user → rejects |
| `notificationService` | Retries ×3 then logs; SMS failure never throws to caller; templates contain no password or card detail, and no token outside a verification/reset link (FR-51) |
| `roleGuard` / `verifiedGuard` | Admin allowed; customer 403; anonymous 401; unverified user blocked from booking |
| `rateLimitService` | A row with `expiresAt` in the past is treated as absent even if still physically present (ADR-013 read-time correctness rule); atomic increment under concurrent attempts never under-counts |
| `tokenRevocationService` | A revoked `jti` present in `revokedtokens` is rejected even if its row has not yet been TTL-reaped; entry `expiresAt` matches remaining token life; no matching row allows the token |

### D4.2 Integration tests (Jest + Supertest, `mongodb-memory-server`)

| Target | Example cases |
|---|---|
| `POST /api/auth/register` | **202, no token in body** (D14); verification token persisted hashed; **response identical for an existing email** (FR-7); hash absent from response body |
| `POST /api/auth/verify-email` | Valid token verifies; reuse rejected; expired rejected |
| `POST /api/auth/login` | 200 with token; 401 on wrong password; identical error for unknown email; 429 after repeated failures |
| `POST /api/auth/forgot-password` | **202 whether or not the account exists** (FR-16); token hashed with 60-min TTL |
| `POST /api/auth/reset-password` | Valid token sets password; all outstanding tokens invalidated; reuse rejected |
| `POST /api/holds` | 201 holds seats and sets TTL; 409 when already held; **403 for an unverified user** (FR-6) |
| `POST /api/bookings/confirm` | Succeeded intent creates a booking; **calling twice creates exactly one** (FR-37); non-succeeded intent → 402 and no booking; another user's hold → 403; **a body containing an unexpected field such as `amount` or `status` is rejected with 400 `VALIDATION_ERROR` (zod `.strict()`) — not silently ignored** (§C7.1) |
| Price integrity | A spoofed `amount` or `totalPrice` field is rejected by strict schema validation before the handler runs; the server never computes a price from anything but stored seat prices |
| `GET /api/bookings/me` | Returns only the caller's bookings; response shape matches the client's declared type (NFR-19) |
| `DELETE /api/cinemas/:id` | 409 when showtimes reference it |
| ~~Cache invalidation~~ | **Removed — NFR-15c withdrawn.** No catalogue cache exists (ADR-013 Option D), so there is nothing to invalidate; an admin update is visible on the very next read by construction. |
| **No cache exists anywhere** | `GET /api/showtimes/:id` and `GET /api/films` make no cache read of any kind; a stale value cannot affect availability or catalogue accuracy (NFR-15b) |
| Session revocation | Token issued, password reset performed, **same token now returns 401** (FR-15) |
| Rate limiting | Counters shared via the `ratelimits` MongoDB collection (ADR-013 Option D); limit not reset by simulating a process restart |

### D4.3 Critical integrity tests

Four tests carrying disproportionate weight, all run in CI on every push:

**(a) Concurrency — O7, FR-29**
> Seed a showtime with one available seat. Fire 50 simultaneous `POST /api/holds` from 50 verified users. **Assert:** exactly one 201, exactly 49 409s, exactly one hold recorded, seat status `held`.

**(b) Confirmation idempotency and the abandoned tab — O8, FR-37, FR-39**
> *(i)* Call `POST /api/bookings/confirm` three times for the same hold with a mocked succeeded PaymentIntent. **Assert:** exactly one Booking exists, seats booked once, one confirmation dispatch attempted, and calls two and three return the same booking with 200.
> *(ii)* Create a hold, mock a succeeded PaymentIntent, **never call confirm**, then run the reconciliation job. **Assert:** the booking is created, seats booked, `booking:confirmed` emitted, and confirmation dispatched.

**(c) Hold expiry — FR-30, FR-31**
> Create a hold, advance time past expiry (fake timers). **Assert:** the seat reads as available *before* the sweeper runs, the sweeper releases it, and a `seats:updated` broadcast is emitted.

**(d) Session revocation — FR-15, ADR-013**
> Log in and capture the JWT. Perform a password reset. **Assert:** the captured token is rejected with 401 on the next request, and a freshly issued token works.

These four are the direct evidence that ADR-012, ADR-013, and ADR-014 work, and are the most valuable tests in the suite.

### D4.4 System / end-to-end tests

Journeys are numbered **J1–J9** and the numbering is stable — test specs cite these IDs directly, so a journey keeps its number even if its steps are refined later.

| ID | Journey | Steps |
|---|---|---|
| J1 | Registration and verification, then full booking with payment | Register (202, no token — D14) → verify email via the link surfaced by `GET /api/dev/last-mail` (D13) → log in (only place a token is issued) → browse film → pick showtime → select seats → create hold (`POST /api/holds`, no Stripe call — D12) → create PaymentIntent (`POST /api/holds/:id/payment-intent` — D12) → pay with Stripe test card → server retrieves and verifies → confirmation shown with reference |
| J2 | Browse and filter films | Visitor browses films now showing, opens a film's detail, filters showtimes by cinema/date/time (FR-19–21); no authentication required |
| J3 | Abandoned tab recovery | Pay with a test card, close the tab before confirm; reconciliation completes the booking and the customer receives confirmation and `booking:confirmed` |
| J4 | Realtime seat updates via socket | Two browser contexts joined to the same `showtime:<id>` room; a hold in A greys those seats in B within 1s via `seats:updated`, no refresh |
| J5 | Hold expiry — no Stripe key required (D12) | Hold seats in A, abandon; after expiry the seats return to available in B, exercising only `POST /api/holds` and the sweeper, with no PaymentIntent ever created |
| J6 | Password reset round-trip | Request reset → open link (via `GET /api/dev/last-mail`, D13) → set new password → old password rejected, new accepted → a JWT issued before the reset is rejected afterwards (`TOKEN_REVOKED`, FR-15) |
| J7 | Verification gate and auth enforcement | Unverified user attempts to book → blocked with `EMAIL_NOT_VERIFIED`; a customer navigating directly to an admin route is blocked with 403 |
| J8 | Admin CRUD lifecycle | Admin creates cinema (with `city`), screen, film, showtime; appears publicly with correct `screenName` and seat tiers; edits and deletes exercise the full CRUD surface (§C4.4) |
| J9 | Admin cancellation and refund flow | Admin cancels a showtime; affected bookings are marked cancelled, refunds initiated, customers notified by email and SMS, and `booking:updated` delivered to each customer's `user:<id>` room |

Stripe test cards drive both success and decline paths. **No Stripe CLI or public endpoint is needed** — all Stripe traffic is outbound (ADR-014), which also makes the demonstration video simpler to record.

### D4.5 Frontend component tests (React Testing Library + jest-axe)

| Target | Example cases |
|---|---|
| `SeatMap` | One button per seat; available selects; held/booked do nothing; `seats:updated` re-renders; a remotely-held selected seat is dropped from selection |
| `HoldCountdown` | Counts down; on expiry clears selection and triggers re-fetch |
| `CheckoutPage` | 409 shows conflict message and does not retry; redirects when selection empty |
| `RegisterForm` | Validation inline; success routes to "check your email" state |
| `ResetPasswordForm` | Expired-token message with a request-new link |
| `ProtectedRoute` | Spinner while loading; redirect when anonymous; preserves `from` |
| `a11y.test.tsx` | Zero axe violations on film list, showtime, checkout, login, register |

### D4.6 Usability testing (UAT)

| Aspect | Plan |
|---|---|
| Participants | Target 5, minimum 3 |
| Protocol | Task-based think-aloud. Tasks: (1) register and verify, (2) find a film showing tomorrow, (3) book two adjacent seats and pay with a test card, (4) find the booking reference, (5) reset the password |
| Measures | Completion rate, time on task, errors, confusion points, post-task rating |
| Specific focus | Does the verification step cause drop-off? Is the hold countdown reassuring or stressful? Is it clear payment is simulated? |
| Ethics | Informed consent, purpose explained, right to withdraw, anonymised results, test accounts and Stripe test cards only — per University requirements |
| Output | Findings ranked by severity, modifications made, re-test of changed flows |

Recording *what changed as a result* is essential — the rubric's top band asks for resultant modifications, not merely that testing happened.

### D4.7 Static analysis

- **ESLint** on client (`@typescript-eslint`) and server; zero errors to pass the pipeline.
- **TypeScript** `tsc --noEmit` strict on the client; type errors fail the build.
- **Secret scanning** before submission; any exposed key rotated at the provider.
- **Metrics for the report:** files and lines, rule violations found and fixed, complexity warnings, type errors resolved during development.

## D5. Test data and environments

| Environment | Database | Integrations |
|---|---|---|
| Local development | Atlas `encore_dev` | Stripe test mode (no CLI needed — ADR-014); capture mailbox, also readable via `GET /api/dev/last-mail` (D13); Notify.lk with limited credit |
| Automated test (local + CI) | `mongodb-memory-server`, ephemeral | **All three fully mocked — no outbound calls** |
| Demonstration / UAT | Atlas `encore_demo`, seeded | Stripe test mode; capture mailbox; real SMS to the presenter's own number |

**Mocking strategy:** Stripe is mocked at the adapter with fixtures for `payment_intent.succeeded` and `payment_intent.payment_failed` retrieval responses — there is no signature verification to mock, since no webhook exists (D7). Nodemailer uses a fake transport capturing messages in memory, exposed to e2e tests via `GET /api/dev/last-mail` (D13) so templates and links can be asserted without a real mailbox. Notify.lk uses a fake HTTP client. **This is what makes the suite fast, deterministic, offline-capable, and free of accidental charges or spam.**

**Seed fixtures:** two cinemas with three screens, five films, twelve showtimes across future dates, one admin, three verified customers, one unverified customer. Each suite resets the database before running so tests never depend on ordering.

## D6. Traceability — requirements to tests

| Req group | Unit | Integration | System | Component | UAT |
|---|---|---|---|---|---|
| FR-1–7 registration + verification | ✔ | ✔ | ✔ | ✔ | ✔ |
| FR-8–12 login + session | ✔ | ✔ | ✔ | ✔ | ✔ |
| FR-13–18 password reset | ✔ | ✔ | ✔ | ✔ | ✔ |
| **FR-15 session revocation** | ✔ | **✔ D4.3(d)** | ✔ | — | — |
| FR-19–25 catalogue | ✔ | ✔ | ✔ | ✔ | ✔ |
| FR-26–28 seat map + realtime | ✔ | ✔ | ✔ | ✔ | ✔ |
| **FR-29 no double-booking** | ✔ | **✔ D4.3(a)** | ✔ | — | — |
| **FR-30/31 hold expiry** | ✔ | **✔ D4.3(c)** | ✔ | ✔ | ✔ |
| FR-32/33 countdown + reconnect | — | — | ✔ | ✔ | ✔ |
| FR-34/35 payment intent + Elements | ✔ | ✔ | ✔ | ✔ | ✔ |
| FR-36/40a server-side verification | ✔ | ✔ | ✔ | — | — |
| **FR-37/39 idempotency + reconciliation** | ✔ | **✔ D4.3(b)** | ✔ | — | — |
| FR-38–41 payment failure paths | ✔ | ✔ | ✔ | ✔ | — |
| FR-42–46 bookings | ✔ | ✔ | ✔ | ✔ | ✔ |
| FR-47–51 notifications | ✔ | ✔ | ✔ | — | ✔ |
| NFR-4–11 security | ✔ | ✔ | ✔ | — | — |
| NFR-12–15 reliability | ✔ | ✔ | ✔ | — | — |
| NFR-15a/b ephemeral-state and no-cache correctness (NFR-15c withdrawn) | ✔ | ✔ | — | — | — |
| NFR-20/21 usability + a11y | — | — | — | ✔ | ✔ |

Every "Must" requirement is covered at two or more levels.

## D7. Testing in the CI/CD pipeline

GitHub Actions runs on every push and pull request, fastest feedback first:

1. **Install** dependencies (cached).
2. **Lint** — ESLint on client and server.
3. **Type-check** — `tsc --noEmit` on the client (NFR-17).
4. **Unit tests** — seconds.
5. **Integration tests** — against `mongodb-memory-server`, all third parties mocked, so the pipeline never depends on Atlas, Stripe, SMTP, or Notify.lk availability. These also assert response shape, standing in for the compile-time API contract the language split forgoes (NFR-19).
6. **Critical integrity tests** — concurrency, confirmation idempotency and reconciliation, hold expiry, session revocation (D4.3).
7. **Coverage report** — fails below the NFR-18 threshold.
8. **Secret scan** — fails if a credential pattern appears in the diff.
9. **Build** — client bundle and Docker images.

System/E2E tests run on demand and before each milestone rather than every push, since their runtime would slow the feedback loop. This staging is a deliberate trade-off worth describing in the report.

## D8. Known gaps and residual risk

- **Load testing is not performed.** §A7 estimates are analytical, not measured.
- **No cross-browser matrix.** Current Chrome and Firefox only.
- **No security penetration testing.** Security is verified through authorisation, token, and enumeration tests, not adversarial testing.
- **The API contract is not compile-time verified** (ADR-008) — asserted by integration tests rather than a shared type.
- **Real deliverability of email and SMS is not automatically tested.** Adapters are mocked in CI; actual delivery is verified manually before the demo. A genuine deliverability failure (spam filtering, carrier rejection) would not be caught by the pipeline.
- **Stripe's own behaviour is assumed correct.** We test our handling of its responses; we do not test Stripe.
- **Confirmation depends on the client returning, or on reconciliation.** Unlike a webhook, nothing pushes the result to us, so a booking can be delayed by up to the reconciliation interval (2 minutes). This is an accepted coursework trade (ADR-014) and would be the wrong choice in production.
- **Single-instance realtime is untested at scale.** Cross-instance broadcast is neither implemented nor exercised — ADR-013 Option D deliberately does not provide a pub/sub path, and multi-instance deployment remains out of scope (§A4.2).

---

## Appendix — coursework requirement checklist

| Brief requirement | Where addressed |
|---|---|
| Chosen topic — **Cinema Booking System** | Title, §A1 |
| React frontend (TypeScript permitted) | §A6.3, §C2.4, ADR-008 |
| Node.js backend (server-side JavaScript) | §A6, ADR-001, ADR-008 |
| MongoDB via web-service API | §C6, §C7.1, ADR-002, ADR-007 |
| **Only permitted database types** | MongoDB is the sole datastore of any kind — durable collections and ephemeral TTL collections alike (§A4.3, ADR-013 Option D). No second database is used; the compliance question this raised in earlier drafts is closed, not merely mitigated. |
| No other server or language | §A4.3 — third-party SaaS consumed over HTTPS, no added application server |
| WebSockets for multi-client appearance | FR-26–33, §C7.2, ADR-003 |
| Interactive (keyboard/mouse) | §C2.3, NFR-21 |
| Distributed across containers/computers | §A6.2, NFR-16, ADR-007 |
| Security (registration/login) | FR-1–18, NFR-4–11, ADR-005, ADR-011 |
| CRUD for ≥3 entities | §C4 — **five** entities |
| 80+ hours of effort | §A9 — ten sprints |
| Component architecture documented | §A6.2, §A6.3, §C6.1 |
| Class/data structures | §C6.2 |
| Design practices (SOLID/DRY/MVC) | §A6.3, Part B |
| Testing: unit | §D4.1 |
| Testing: integration | §D4.2, §D4.3 |
| Testing: system | §D4.4 |
| Testing: UAT with participants, protocol, results | §D4.6 |
| Static code analysis metrics | §D4.7 |
| CI/CD pipeline | §D7, §A9 |
| Evaluation basis | O1–O10, ADR revisit triggers, ADR-004 and ADR-009 supersessions, §D8 |
| Credentials kept out of source control | §A6.4, NFR-10, R9 |
| Permitted AI use only | §A4.3, §A12 |
