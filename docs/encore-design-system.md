# Encore — Design System

**Cinema ticket booking web app · v2.0**

> A ticket you can almost tear. The system is grounded in the physical artifact of a night at the cinema — the printed ticket stub — rather than tech-UI conventions. Warm paper, ink, letterpress type, and a perforated tear-line give the app one memorable identity.

**Changelog**

| Version | Change |
|---|---|
| 1.0 | Baselined for the original concert-domain app. |
| 2.0 | Migrated terminology to the cinema domain: `STAGE` → `SCREEN`, `--stage-green` → `--seat-free`. Corrected the phantom `seatUpdate` event to the real `seats:updated` event. Documented the held-seat visual state (previously undocumented, per ADR-012). Documented seat-tier keys (Standard / Premium / Recliner). Added the "Refunded" status badge for the payment-reconciliation flow. Reframed §10 from prescriptive plain CSS to how tokens actually wire into Tailwind v4. Scrubbed remaining concert-domain wording (event/venue/gig → film/cinema/showtime). |

---

## 1. Design direction

The generic ticketing app is near-black with a neon accent. Encore deliberately avoids that. Every distinctive choice derives from the printed stub: the paper base, the monospace serial/seat numbers, the letterpress film-poster titles, and the perforated tear-line that recurs across the showtime card, the booking confirmation, and the "my tickets" view.

- **Target users:** moviegoers booking seats for film showtimes; admins managing films, cinemas, screens, and showtimes.
- **The page's one job:** make choosing a showtime and picking a seat feel like holding a real ticket.
- **Signature element:** the perforated stub — a dashed tear-line with a barcode panel.

---

## 2. Color palette

| Token | Name | Hex | Role |
|---|---|---|---|
| `--ink` | Ink | `#1A1714` | Primary text, stub background |
| `--stamp-red` | Stamp red | `#C8102E` | Primary actions (Book seats) |
| `--marquee-gold` | Marquee gold | `#E4B04A` | Accents, selected seat |
| `--ticket-paper` | Ticket paper | `#F3EEE3` | Page background, text on ink |
| `--seat-free` | Seat free | `#3A7D6E` | Available seat |
| `--ash` | Ash | `#8A8178` | Muted text, dividers |
| `--seat-taken` | Seat taken | `#B8AFA4` | Unavailable seat (held or booked) |

Colors carry meaning, not decoration. Green = available, gold = your selection, ash = held or booked.

> **Rename in progress:** `client/src/index.css` still defines this token as `--stage-green` (and the matching Tailwind theme key `--color-stage-green`). This document uses the target name `--seat-free` because the token colors an individual available *seat*, not the room — a future implementation phase renames it in code to match. Until that lands, treat `--stage-green` in the codebase as this document's `--seat-free`.

---

## 3. Typography

Three roles. A serif "voice" face for marquee/film titles (the letterpress film-poster feel), sans for body and UI, and monospace for all data — seat numbers, serials, prices, and section codes. The mono treatment is what makes `B-14 · #ENC-4471` read like a barcode-printed ticket.

| Role | Family | Size | Weight | Use |
|---|---|---|---|---|
| Marquee | Serif (voice) | 34px | 500 | App name, film titles |
| Showtime title | Sans | 22px | 500 | Card and section headings |
| Body | Sans | 16px | 400 | Details, descriptions (line-height 1.7) |
| Data | Mono | 13px | 400 | Seat numbers, serials, prices, section codes |

**Rules:** sentence case everywhere; two weights only (400 regular, 500 medium); mono is reserved for machine-readable data.

---

## 4. The ticket stub (signature)

The recurring hero element. An ink panel split by a dashed vertical tear-line, with a barcode + serial panel on the right.

**Anatomy:**
- **Left (detail) panel** — gold eyebrow (date/time in mono), serif film title, cinema and screen name in ash, then a mono row of `SECTION / SEAT / PRICE`.
- **Tear-line** — `2px dashed` divider in a mid-ash tone (`#55504A` on ink).
- **Right (stub) panel** — vertical barcode bars in paper on ink, with the mono serial (`ENC-4471`) beneath.

Reused across: the showtime card, the booking confirmation, and the "my tickets" list.

---

## 5. Buttons

| Variant | Background | Text | Border | Use |
|---|---|---|---|---|
| Primary | `--stamp-red` | `--ticket-paper` | none | Book seats |
| Secondary | transparent | `--text-primary` | `0.5px` strong | View details |
| Disabled | transparent | `--ash` | `0.5px` hairline | Sold out |

Radius `--radius` (8px), padding `10px 20px`, size 14px / weight 500. One primary action per view.

---

## 6. Form fields

Labels sit above the control: 13px, secondary color, 6px gap. Inputs and selects are full-width within their grid cell, 36px tall, with hairline borders and built-in hover/focus rings. Placeholders show a real example of valid input (`name@email.com`), never the label repeated.

---

## 7. Seat map (live availability)

A `SCREEN` bar (ink background, gold label) sits above a grid of seats. Each seat is a rounded square colored by state:

- **Available** — `--seat-free`, pointer cursor.
- **Selected** — `--marquee-gold`.
- **Held** — same fill as Taken (`--seat-taken`, reduced opacity) *plus* a dashed inset border (`border-dashed`, low-opacity ink) as a non-color cue; not-allowed cursor. See §7.1 below.
- **Taken (booked)** — `--seat-taken`, reduced opacity, not-allowed cursor.

A legend below the grid maps each swatch to its meaning, including a dashed-border sample for "On hold" alongside the solid swatches for the other three states. Seat state is driven live by WebSocket `seats:updated` events (payload: `{ eventId, seatIds, status }`) — when another client books or holds a seat, the affected buttons re-render to the new status in real time. If a seat the current user had selected is remotely booked out from under them, it is dropped from their selection and surfaced as an error toast ("A seat you selected was just taken.").

### 7.1 Held seats

A **held** seat is a temporary, time-limited reservation created when another customer has the seat in checkout but has not yet completed payment (ADR-012's TTL hold — 10 minutes, released by a server-side sweeper on expiry or abandonment). It is a *reversible* unavailable state, distinct from a permanently booked seat, and is documented as its own visual state for that reason:

- **Fill** — `--seat-taken`, same reduced opacity as a booked seat. Held and booked deliberately share a fill color: fill is reserved for the coarse available/unavailable distinction, not for every sub-state.
- **Pattern** — an inset dashed border (`border-dashed`, ink at ~30% opacity) layered over the fill, so the two "unavailable" states are told apart without relying on color alone (WCAG non-color-cue requirement, tracked as NFR-11 in the SRS).
- **Interaction** — non-interactive, same as booked: `disabled`, `aria-disabled="true"`, not-allowed cursor.
- **Assistive tech** — the accessible name is more specific than "unavailable": *"Seat `<id>`, row `<row>`, `<price>`, on hold by another customer"*, so a screen-reader user understands the seat may free up rather than assuming it is gone for good.
- **Legend** — the seat-map legend includes a dedicated "On hold" swatch (the same dashed-border-over-taken-fill treatment) alongside Available, Selected, and Taken, so the pattern is documented on-screen as well as here.

### 7.2 Seat tiers

Three seat tiers price seats within a screen: **STANDARD** (×1.00), **PREMIUM** (×1.35), **RECLINER** (×1.80). Tier is a second, independent visual channel from availability and must **never** be conveyed through fill color — fill color is reserved exclusively for the available/selected/held/taken states above. Tier is instead conveyed through:

- an **outline/border treatment** on the seat button — e.g. a heavier or differently-styled border for Premium, a distinct corner accent for Recliner — layered on top of whichever availability fill color already applies, or
- a **labeled block heading** above each tier's row-group in the seat map (a small mono caption, e.g. `PREMIUM` / `RECLINER`, ahead of the relevant rows), consistent with the row-letter labels already rendered to the left of each row.

| Key | Tier | Price multiplier |
|---|---|---|
| plain border | Standard | ×1.00 |
| heavier border | Premium | ×1.35 |
| accent-corner border | Recliner | ×1.80 |

> **Status:** seat tiers are not yet modeled in `Seat` (`client/src/lib/types.ts`) or rendered by `SeatMap.tsx` / `Seat.tsx` as of this version. This subsection documents the intended target design — outline/heading only, never fill — so the rule is settled ahead of implementation.

---

## 8. Status badges

Pill-shaped (`border-radius: 999px`), 12px / weight 500, tint background with a darker same-family text color.

| Status | Background | Text |
|---|---|---|
| Confirmed | `#E1F5EE` | `#0F6E56` |
| Pending | `#FAEEDA` | `#854F0B` |
| Cancelled | `#FCEBEB` | `#A32D2D` |
| Refunded | `#EDEAF6` | `#4B3F8F` |
| Few left | `#F1EFE8` | `#444441` |

**Refunded** marks a booking whose payment has been returned to the customer — surfaced by the payment-reconciliation flow (e.g. an automatic refund on a post-payment seat-allocation failure, or a cancelled showtime that triggers refunds for its bookings). It is intentionally a distinct color family from Cancelled: a booking can be cancelled without money having moved, and Refunded exists to make "the money is actually back with the customer" visually unambiguous. `client/src/index.css` does not yet define `--status-refunded-bg` / `--status-refunded-fg`; add them alongside the existing `--status-*` tints when this badge is implemented.

---

## 9. Layout tokens

| Token | Value |
|---|---|
| Card radius | `12px` |
| Control radius | `--radius` (8px) |
| Card border | `0.5px solid` hairline |
| Card padding | `1rem 1.25rem` |
| Vertical rhythm | `1rem` / `1.5rem` / `2rem` |
| Component gaps | `8px` / `12px` / `16px` |

---

## 10. Design tokens in Tailwind v4

The client ships **Tailwind CSS v4** via `@tailwindcss/vite` — there is no `tailwind.config.*` file; v4's CSS-first configuration lives entirely in `client/src/index.css`. Tokens are not "dropped into plain CSS" as a separate system from Tailwind; they're defined once as custom properties on `:root`, then re-exposed to Tailwind's utility generator through an `@theme inline` block, so every token in this document is available as an ordinary Tailwind utility class (`bg-*`, `text-*`, `border-*`, `rounded-*`, `font-*`) with no config file involved.

**How it's wired (`client/src/index.css`):**

```css
:root {
  --ink: #1a1714;
  --stamp-red: #c8102e;
  --marquee-gold: #e4b04a;
  --ticket-paper: #f3eee3;
  --stage-green: #3a7d6e;   /* target name: --seat-free, see §2 */
  --ash: #8a8178;
  --seat-taken: #b8afa4;
  --radius: 8px;
  /* …derived surfaces, text, status tints, type, spacing, shadows… */
}

@theme inline {
  --color-ink: var(--ink);
  --color-stamp-red: var(--stamp-red);
  --color-marquee-gold: var(--marquee-gold);
  --color-ticket-paper: var(--ticket-paper);
  --color-stage-green: var(--stage-green);   /* target: --color-seat-free */
  --color-ash: var(--ash);
  --color-seat-taken: var(--seat-taken);
  /* …background/foreground/border/etc, font families, radii… */

  --radius-sm: 6px;
  --radius-md: var(--radius);
  --radius-lg: var(--radius-card);
}
```

Two layers, two jobs:

- **`:root`** holds the raw design values — the single source of truth behind every table in this document. It also hosts the shadcn/ui token bridge (`--primary`, `--accent`, `--destructive`, `--ring`, …), which aliases back to the tokens above so third-party components inherit the ticket-stub palette without extra work.
- **`@theme inline`** maps each raw token onto a Tailwind theme key (`--color-*`, `--font-*`, `--radius-*`). That mapping is what makes `bg-stamp-red`, `text-ash`, `font-voice`, or `bg-seat-free` (once renamed) valid utility classes directly in JSX. Prefer these utilities over hand-written CSS; the only hand-written CSS in the codebase is the small set of structural rules in `@layer base` / `@layer utilities` (the paper-grain background, focus rings, the `.eyebrow` mono-caption style) that don't map cleanly onto a single utility.

When this document says a component "uses `--seat-free`" or "`--marquee-gold`", the Tailwind-facing spelling is a class like `bg-seat-free` / `bg-marquee-gold` (or the `text-`/`border-` equivalents) — not a literal hex value or an inline `style` prop, with the narrow exception of computed values Tailwind's static utility generation can't express (e.g. `SeatMap.tsx`'s per-row `gridTemplateColumns`, which is genuinely dynamic).

This replaces v1.0 of this section, which described dropping a bare `:root` block into `index.css` as the whole story, as if the project had no utility framework. Encore has used Tailwind v4 from the start; the `:root` → `@theme inline` pipeline above is what actually ships.
