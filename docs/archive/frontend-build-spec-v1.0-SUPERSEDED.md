> ## ⚠️ SUPERSEDED — v1.0 Frontend Build Spec (archived)
>
> This document is an early design-tool artifact for a **concert/live-events** ticketing app ("Encore") and is kept only as historical evidence of drift for the report's Evaluation section — it does not describe the current implementation and should not be used as a build reference.
>
> | Aspect | v1.0 spec (this file) | Current implementation |
> |---|---|---|
> | React version | React 18 | React 19 (`client/package.json`: `react@^19.0.0`) |
> | Router version | React Router v6 | React Router 7 (`client/package.json`: `react-router-dom@^7.18.2`) |
> | Styling approach | Plain CSS with custom properties, no CSS framework | Tailwind CSS v4 via `@tailwindcss/vite` (`client/src/index.css`: `@import 'tailwindcss'`) |
> | Domain | Concert / live-events ticket booking | Cinema / film booking |

---

# Encore Frontend — Complete Build Specification

**Use this as the single source of truth for building the Encore client.** It is written to be handed to a coding assistant or worked through manually, section by section.

> **Academic integrity note (PUSL3120).** The module permits AI in an assistive role only (categories A1–A10); you must not submit AI-generated code as your own and must be able to explain every line. Use this specification as an architectural brief — build from it, understand what you write, and modify it. The report and video are marked on *your* ability to explain what you built.

---

## 0. Context

You are building the frontend for **Encore**, a musical concert ticket booking system. It is university coursework assessed on architecture, testing, real-time behaviour, and security — **not on visual polish** (the brief explicitly awards no marks for aesthetics, so correctness and clarity come first).

**Stack — non-negotiable:**

| Concern | Choice |
|---|---|
| Framework | React 18 |
| Language | **TypeScript**, `strict` mode |
| Build tool | Vite |
| Routing | React Router v6 |
| HTTP | Axios |
| Realtime | `socket.io-client` |
| Styling | Plain CSS with custom properties — **no CSS framework** |
| Testing | Vitest + React Testing Library + `jest-axe` |
| State | React Context + `useReducer`. **No Redux, no Zustand, no React Query** |

**Backend contract:** the API is Node.js/Express in **JavaScript**, so no types cross the network boundary. Every response type is declared by hand on the client in one file (`src/types/api.ts`). Treat that file as the contract.

---

## 1. Design system — exact tokens

Create `src/styles/tokens.css` and import it once in `main.tsx`. **Every colour, radius, and font in the app must reference these variables. No hard-coded hex values anywhere else.**

```css
:root {
  /* Core palette */
  --ink: #1A1714;
  --stamp-red: #C8102E;
  --marquee-gold: #E4B04A;
  --ticket-paper: #F3EEE3;
  --stage-green: #3A7D6E;
  --ash: #8A8178;
  --seat-taken: #B8AFA4;

  /* Derived surfaces */
  --bg: #F3EEE3;
  --surface: #FFFFFF;
  --surface-sunk: #EDE7DA;
  --border: rgba(26, 23, 20, 0.12);
  --border-strong: rgba(26, 23, 20, 0.28);

  /* Text */
  --text-primary: #1A1714;
  --text-secondary: #55504A;
  --text-muted: #8A8178;
  --text-on-ink: #F3EEE3;

  /* Status tints */
  --status-confirmed-bg: #E1F5EE;
  --status-confirmed-fg: #0F6E56;
  --status-pending-bg: #FAEEDA;
  --status-pending-fg: #854F0B;
  --status-cancelled-bg: #FCEBEB;
  --status-cancelled-fg: #A32D2D;
  --status-neutral-bg: #F1EFE8;
  --status-neutral-fg: #444441;

  /* Type */
  --font-voice: Georgia, "Times New Roman", serif;
  --font-sans: system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: "SF Mono", "Roboto Mono", ui-monospace, monospace;

  /* Radii */
  --radius: 8px;
  --radius-card: 12px;
  --radius-pill: 999px;

  /* Spacing scale */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 48px;

  /* Elevation */
  --shadow-card: 0 1px 3px rgba(26, 23, 20, 0.08);
}
```

**Typography rules — apply exactly:**

| Role | Family | Size | Weight | Where |
|---|---|---|---|---|
| Marquee | `--font-voice` | 34px | 500 | App name, event titles on detail pages |
| Section title | `--font-sans` | 22px | 500 | Card headings, page section headers |
| Body | `--font-sans` | 16px | 400 | Prose, descriptions (line-height 1.7) |
| Small | `--font-sans` | 13px | 400 | Labels, helper text |
| Data | `--font-mono` | 13px | 400 | Seat IDs, booking references, prices, section codes |
| Eyebrow | `--font-mono` | 11px | 400 | Uppercase, `letter-spacing: 0.16em`, above titles |

**Hard rules:**
- Only two weights: 400 and 500. Never 600, 700, or bold.
- Sentence case for all headings and buttons. Never Title Case. Never ALL CAPS except mono eyebrows.
- Monospace is reserved for machine-readable data — seat IDs, references, prices, dates in stub format. Never for prose.
- Borders are `0.5px solid var(--border)`. Never 1px, never 2px, except the ticket tear-line.

---

## 2. Project structure

Create exactly this structure under `client/`:

```
client/
├── .env.example
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── .eslintrc.cjs
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── types/
    │   └── api.ts                 # THE contract — all API + socket types
    ├── styles/
    │   ├── tokens.css
    │   └── global.css
    ├── lib/
    │   ├── apiClient.ts           # Axios instance + interceptors
    │   ├── formatters.ts          # price, date, seat label formatting
    │   └── errors.ts              # ApiError parsing
    ├── context/
    │   ├── AuthContext.tsx
    │   ├── SocketContext.tsx
    │   └── ToastContext.tsx
    ├── hooks/
    │   ├── useAuth.ts
    │   ├── useSocket.ts
    │   ├── useEventSeats.ts       # seat state + live updates reducer
    │   └── useToast.ts
    ├── components/
    │   ├── layout/
    │   │   ├── AppShell.tsx
    │   │   ├── Header.tsx
    │   │   └── Footer.tsx
    │   ├── ui/
    │   │   ├── Button.tsx
    │   │   ├── Input.tsx
    │   │   ├── Select.tsx
    │   │   ├── Badge.tsx
    │   │   ├── Card.tsx
    │   │   ├── Spinner.tsx
    │   │   ├── EmptyState.tsx
    │   │   ├── ErrorState.tsx
    │   │   ├── Modal.tsx
    │   │   └── Toast.tsx
    │   ├── tickets/
    │   │   ├── TicketStub.tsx     # SIGNATURE component
    │   │   └── EventCard.tsx
    │   ├── seats/
    │   │   ├── SeatMap.tsx
    │   │   ├── Seat.tsx
    │   │   ├── SeatLegend.tsx
    │   │   └── SelectionSummary.tsx
    │   └── routing/
    │       ├── ProtectedRoute.tsx
    │       └── AdminRoute.tsx
    └── pages/
        ├── EventListPage.tsx
        ├── EventDetailPage.tsx
        ├── CheckoutPage.tsx
        ├── ConfirmationPage.tsx
        ├── MyBookingsPage.tsx
        ├── LoginPage.tsx
        ├── RegisterPage.tsx
        ├── ProfilePage.tsx
        ├── NotFoundPage.tsx
        └── admin/
            ├── AdminDashboardPage.tsx
            ├── AdminEventsPage.tsx
            ├── AdminEventFormPage.tsx
            ├── AdminVenuesPage.tsx
            └── AdminBookingsPage.tsx
```

---

## 3. The type contract — `src/types/api.ts`

**This file is the entire API contract.** Because the server is JavaScript, nothing enforces this at compile time; integration tests on the server assert these shapes. Any API change must be reflected here and nowhere else.

```ts
// ---------- Domain ----------
export type Role = 'customer' | 'admin';
export type SeatStatus = 'available' | 'booked';
export type EventStatus = 'scheduled' | 'cancelled';
export type BookingStatus = 'confirmed' | 'cancelled';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
}

export interface Seat {
  id: string;          // e.g. "B-14"
  section: string;     // e.g. "GA-2"
  row: string;
  number: number;
  status: SeatStatus;
  price: number;
}

export interface Venue {
  id: string;
  name: string;
  address: string;
  capacity: number;
  seatLayout: Omit<Seat, 'status' | 'price'>[];
}

export interface EventSummary {
  id: string;
  title: string;
  artist: string;
  date: string;            // ISO 8601
  basePrice: number;
  venue: Pick<Venue, 'id' | 'name'>;
  status: EventStatus;
  availableSeats: number;
  totalSeats: number;
}

export interface EventDetail extends EventSummary {
  seats: Seat[];
}

export interface Booking {
  id: string;
  reference: string;       // e.g. "ENC-4471"
  event: Pick<EventSummary, 'id' | 'title' | 'artist' | 'date'> & {
    venue: Pick<Venue, 'id' | 'name'>;
  };
  seats: Seat[];
  totalPrice: number;
  status: BookingStatus;
  createdAt: string;
}

// ---------- Requests ----------
export interface RegisterRequest { name: string; email: string; password: string; }
export interface LoginRequest { email: string; password: string; }
export interface CreateBookingRequest { eventId: string; seatIds: string[]; }
export interface EventFilters {
  page?: number; limit?: number;
  artist?: string; from?: string; to?: string; venue?: string;
}

// ---------- Responses ----------
export interface AuthResponse { user: User; token: string; }
export interface Paginated<T> { items: T[]; total: number; page: number; limit: number; }
export type EventListResponse = Paginated<EventSummary>;
export type BookingListResponse = Paginated<Booking>;

// ---------- Errors ----------
export type ApiErrorCode =
  | 'VALIDATION_ERROR' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND'
  | 'EMAIL_EXISTS' | 'SEAT_UNAVAILABLE' | 'VENUE_IN_USE'
  | 'RATE_LIMITED' | 'SERVER_ERROR' | 'NETWORK_ERROR';

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string; details?: Record<string, unknown>; };
}

// ---------- Socket events ----------
export interface JoinEventPayload { eventId: string; }
export interface LeaveEventPayload { eventId: string; }
export interface SeatsUpdatedPayload {
  eventId: string; seatIds: string[]; status: SeatStatus;
}
export interface EventCancelledPayload { eventId: string; }
export interface SocketErrorPayload { code: string; message: string; }

export interface ServerToClientEvents {
  'seats:updated': (p: SeatsUpdatedPayload) => void;
  'event:cancelled': (p: EventCancelledPayload) => void;
  'error': (p: SocketErrorPayload) => void;
}
export interface ClientToServerEvents {
  'join:event': (p: JoinEventPayload) => void;
  'leave:event': (p: LeaveEventPayload) => void;
}
```

**Rule: `any` is banned on every API boundary.** Configure ESLint to error on `@typescript-eslint/no-explicit-any`.

---
## 4. Infrastructure layer

### 4.1 `src/lib/apiClient.ts`

- Create one Axios instance with `baseURL: import.meta.env.VITE_API_URL`.
- **Request interceptor:** attach `Authorization: Bearer <token>` when a token exists.
- **Response interceptor:** on `401`, clear auth state and redirect to `/login`. On any error, normalise into a typed `ApiError` object with `code`, `message`, and `details`.
- **Never** put a token, email, or any personal data in a query string.
- Export typed functions, one per endpoint — components never call `axios` directly:

```
authApi:    register, login, getMe, updateMe, deleteMe
eventsApi:  list(filters), getById, create, update, remove
venuesApi:  list, create, update, remove
bookingsApi: create, listMine, cancel, listAll
healthApi:  check
```

### 4.2 `src/lib/errors.ts`

Export `parseApiError(err: unknown): ApiError` that handles: Axios error with a well-formed body, Axios error with a malformed body, network failure (no response), and a non-Axios throw. It must never return `undefined` and must always produce a user-facing message.

Map codes to human messages:

| Code | Message |
|---|---|
| `SEAT_UNAVAILABLE` | "Those seats were just taken. The map has been updated." |
| `EMAIL_EXISTS` | "An account with this email already exists." |
| `UNAUTHORIZED` | "Please sign in to continue." |
| `FORBIDDEN` | "You don't have permission to do that." |
| `RATE_LIMITED` | "Too many attempts. Please wait a moment." |
| `NETWORK_ERROR` | "Can't reach the server. Check your connection." |
| default | "Something went wrong. Please try again." |

### 4.3 `src/lib/formatters.ts`

```
formatPrice(n: number): string        // "£48.00"
formatEventDate(iso: string): string  // "Fri 12 Sep 2026, 20:00"
formatStubDate(iso: string): string   // "FRI · 12 SEP · 20:00"  (mono eyebrow)
formatSeatLabel(seat: Seat): string   // "B-14"
```

### 4.4 `src/context/AuthContext.tsx`

State: `{ user: User | null; token: string | null; status: 'loading' | 'authenticated' | 'anonymous' }`.

- Persist the token to `localStorage` under key `encore_token`; rehydrate on mount by calling `getMe()`. If that call fails, clear the token and set `anonymous`.
- Expose `login`, `register`, `logout`, `updateProfile`, and derived `isAdmin`.
- **`status` must start as `loading`**, and `ProtectedRoute` must render a spinner while loading — otherwise a page refresh briefly bounces an authenticated user to `/login`. This is the most common bug in this pattern; handle it explicitly.

### 4.5 `src/context/SocketContext.tsx`

- Create one `socket.io-client` connection for the whole app lifetime. Pass the JWT in `auth: { token }` on the handshake.
- Reconnect automatically with backoff (Socket.IO default is fine).
- Expose `socket`, `isConnected`, `joinEvent(id)`, `leaveEvent(id)`.
- **On every reconnect, emit a `reconnected` signal that consumers use to re-fetch authoritative state.** Never trust cached seat state after a disconnect.
- Clean up all listeners on unmount. No listener may be registered without a matching removal.

### 4.6 `src/context/ToastContext.tsx`

Simple queue of `{ id, variant: 'success' | 'error' | 'info', message }`. Auto-dismiss after 5s. Render in a fixed bottom-right stack. Toasts must have `role="status"` and `aria-live="polite"`.

---

## 5. Routing — `src/App.tsx`

```
/                        → EventListPage            public
/events/:id              → EventDetailPage          public
/checkout/:eventId       → CheckoutPage             ProtectedRoute
/confirmation/:bookingId → ConfirmationPage         ProtectedRoute
/bookings                → MyBookingsPage           ProtectedRoute
/profile                 → ProfilePage              ProtectedRoute
/login                   → LoginPage                public (redirect if authed)
/register                → RegisterPage             public (redirect if authed)
/admin                   → AdminDashboardPage       AdminRoute
/admin/events            → AdminEventsPage          AdminRoute
/admin/events/new        → AdminEventFormPage       AdminRoute
/admin/events/:id/edit   → AdminEventFormPage       AdminRoute
/admin/venues            → AdminVenuesPage          AdminRoute
/admin/bookings          → AdminBookingsPage        AdminRoute
*                        → NotFoundPage
```

- `ProtectedRoute`: while `status === 'loading'` render `<Spinner />`; if anonymous, `<Navigate to="/login" state={{ from: location }} replace />`; after login, return the user to `from`.
- `AdminRoute`: same, plus require `user.role === 'admin'`; otherwise render a 403 state — **do not** redirect silently, the user should understand what happened.
- Client-side route guards are **UX only, never security**. The server enforces authorisation. State this in a code comment so it is clear you understand the distinction.

---

## 6. UI primitives — exact specifications

### `Button.tsx`

Props: `variant: 'primary' | 'secondary' | 'ghost' | 'danger'`, `size: 'sm' | 'md'`, `isLoading?`, `fullWidth?`, plus all native button props.

| Variant | Background | Text | Border |
|---|---|---|---|
| primary | `--stamp-red` | `--text-on-ink` | none |
| secondary | transparent | `--text-primary` | `0.5px solid var(--border-strong)` |
| ghost | transparent | `--text-secondary` | none |
| danger | transparent | `--status-cancelled-fg` | `0.5px solid currentColor` |

- `md`: `padding: 10px 20px; font-size: 14px; font-weight: 500`. `sm`: `padding: 6px 14px; font-size: 13px`.
- `border-radius: var(--radius)`.
- Hover: `filter: brightness(0.94)`. Active: `brightness(0.88)`.
- Focus-visible: `outline: 2px solid var(--ink); outline-offset: 2px`.
- Disabled: `opacity: 0.5; cursor: not-allowed`.
- `isLoading`: show inline spinner, set `disabled` and `aria-busy="true"`, keep the label visible so width does not jump.
- Transitions: `120ms ease`, and wrap in `@media (prefers-reduced-motion: reduce) { transition: none }`.

**One primary button per view.** Never two.

### `Input.tsx`

Props: `label` (required), `error?`, `hint?`, plus native input props.

- Label above: 13px, `--text-secondary`, `margin-bottom: 6px`. Always a real `<label htmlFor>` — never a placeholder as label.
- Input: `height: 38px; padding: 0 12px; border: 0.5px solid var(--border); border-radius: var(--radius); background: var(--surface); font-size: 15px`.
- Focus: border becomes `--border-strong`, plus `outline: 2px solid var(--ink); outline-offset: 1px`.
- Error: border `--status-cancelled-fg`; message below in 13px `--status-cancelled-fg` with `role="alert"`; input gets `aria-invalid="true"` and `aria-describedby` pointing at the message.
- Placeholders show a valid example (`name@email.com`), never the label repeated.

### `Badge.tsx`

Props: `variant: 'confirmed' | 'pending' | 'cancelled' | 'neutral'`.
`padding: 4px 12px; border-radius: var(--radius-pill); font-size: 12px; font-weight: 500`, colours from the status tokens.

### `Card.tsx`

`background: var(--surface); border: 0.5px solid var(--border); border-radius: var(--radius-card); padding: var(--space-4) var(--space-5); box-shadow: var(--shadow-card)`.

### `EmptyState.tsx` / `ErrorState.tsx`

Both take `title`, `message`, optional `action`. Centred, `padding: var(--space-7)`, title 22px/500, message 15px `--text-secondary`. **Every list in the app must render an empty state** — never a blank area.

### `Modal.tsx`

- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing at the title.
- Focus moves into the dialog on open and returns to the trigger on close.
- **Focus is trapped** inside while open. Escape closes. Backdrop click closes.
- Body scroll locked while open.

---

## 7. The signature component — `TicketStub.tsx`

This is the visual identity of the whole app. It appears on the event card, the confirmation page, and every entry in My Bookings. **Build it once, reuse it everywhere.**

Props:
```ts
interface TicketStubProps {
  eyebrow: string;          // formatStubDate() output
  title: string;            // artist or event title
  subtitle: string;         // venue · section
  fields: { label: string; value: string }[];  // SECTION / SEAT / PRICE
  serial: string;           // "ENC-4471"
  variant?: 'full' | 'compact';
  onClick?: () => void;
}
```

**Structure — a flex row on an ink background:**

1. **Left panel** (`flex: 1`, `padding: 18px 20px`, `background: var(--ink)`, `color: var(--text-on-ink)`):
   - Eyebrow: `--font-mono`, 11px, `letter-spacing: 0.16em`, colour `--marquee-gold`.
   - Title: `--font-voice`, 26px, weight 500, `margin: 6px 0 2px`, `letter-spacing: -0.01em`.
   - Subtitle: 14px, colour `#B8AFA4`.
   - Fields row: `display: flex; gap: 20px; margin-top: 14px`. Each field is a mono 10px uppercase label in `--ash` above a mono 14px value in `--text-on-ink`.

2. **Tear line** — the defining detail. A `2px dashed` vertical divider in `#55504A`, full height, zero width. Add two half-circle notches punched out at top and bottom using `::before`/`::after` with `background: var(--bg); border-radius: 50%; width: 12px; height: 12px`, positioned to straddle the edge. This is what sells the perforation.

3. **Right stub** (`width: 96px`, centred column):
   - Eight vertical bars of varying widths (1–3px), 34px tall, in `--text-on-ink`, `gap: 2px` — a suggestion of a barcode, not a real one.
   - Serial below in mono 10px, `letter-spacing: 0.1em`, colour `--ash`.

- `variant="compact"` reduces title to 20px, padding to `12px 16px`, and hides the fields row.
- Outer: `border-radius: var(--radius-card); overflow: hidden`.
- If `onClick` is provided, render as a `<button>` with `text-align: left`, not a `<div>`. Clickable divs are an accessibility failure.

---
## 8. The seat map — the most important feature

This is where the WebSocket requirement is demonstrated and where most marks in the Software category are won or lost. Build it carefully.

### 8.1 `useEventSeats.ts`

A hook owning seat state for one event, driven by `useReducer`.

```ts
type SeatsState = {
  seats: Seat[];
  selectedIds: string[];
  status: 'loading' | 'ready' | 'error';
  error: string | null;
};

type SeatsAction =
  | { type: 'LOADED'; seats: Seat[] }
  | { type: 'LOAD_FAILED'; message: string }
  | { type: 'TOGGLE_SELECT'; seatId: string }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'REMOTE_UPDATE'; seatIds: string[]; status: SeatStatus }
  | { type: 'RESYNC'; seats: Seat[] };
```

**Behaviour:**
- On mount: fetch `GET /api/events/:id`, dispatch `LOADED`, then `joinEvent(id)`.
- On unmount: `leaveEvent(id)` and remove all listeners.
- On `seats:updated`: dispatch `REMOTE_UPDATE`. **If any remotely-booked seat is in `selectedIds`, drop it from the selection and raise an error toast**: "A seat you selected was just taken." Leaving a taken seat visually selected is a correctness bug.
- On socket reconnect: re-fetch the event and dispatch `RESYNC`. Never trust cached state after a gap.
- `TOGGLE_SELECT` must reject seats whose status is not `available`.
- Cap selection at **8 seats**; beyond that show a toast and ignore the click.

### 8.2 `Seat.tsx`

Rendered as a `<button>`, never a div.

| State | Background | Cursor | `aria-disabled` |
|---|---|---|---|
| available | `--stage-green` | pointer | false |
| selected | `--marquee-gold` | pointer | false |
| taken | `--seat-taken` | not-allowed | true |

- `aspect-ratio: 1; border-radius: 4px; border: none`.
- `aria-label` must be fully descriptive: `"Seat B-14, row B, £48.00, available"` / `"...selected"` / `"...unavailable"`.
- `aria-pressed={isSelected}`.
- **Do not rely on colour alone (NFR-11).** Selected seats additionally show a small dark dot or ring; taken seats render at `opacity: 0.55`. A colour-blind user must be able to tell states apart.
- Transition `background-color 150ms ease`; disabled under `prefers-reduced-motion`.
- Focus-visible ring: `outline: 2px solid var(--ink); outline-offset: 2px`.

### 8.3 `SeatMap.tsx`

- A `STAGE` bar above the grid: `background: var(--ink); color: var(--marquee-gold)`, mono 11px, `letter-spacing: 0.2em`, centred, `padding: 6px 0`, `border-radius: var(--radius)`.
- Grid: `display: grid; gap: 6px`, columns derived from the venue layout (group by row). Row labels in mono 11px `--ash` down the left.
- Wrap in `role="group"` with `aria-label="Seat selection map"`.
- **Keyboard navigation:** arrow keys move focus between seats, Enter/Space toggles. Implement a roving `tabIndex` — only one seat is tabbable at a time, the rest are `tabIndex={-1}`.
- Include a visually hidden `aria-live="polite"` region announcing changes: "3 seats now unavailable" when a remote update lands, and "Seat B-14 selected" on selection.
- While loading, render skeleton squares — never a blank grid.

### 8.4 `SeatLegend.tsx`

Horizontal row of three swatches (12px squares) with labels: Available / Selected / Taken. Directly below the map, 12px `--text-secondary`.

### 8.5 `SelectionSummary.tsx`

Sticky panel (bottom on mobile, right column on desktop):
- Selected seat IDs as mono chips, each with a small remove "×" button.
- Running total via `formatPrice`. **Compute it from seat prices for display only — the server recomputes and its value is authoritative.** Add a code comment saying so.
- Primary button "Continue to checkout", disabled when nothing is selected.

---

## 9. Pages — required behaviour

Every page must handle **four states**: loading, error, empty, and success. Not one of them may be skipped.

### `EventListPage`
- Filter bar: text search (artist/title, debounced 300ms), date-from, date-to, venue select. Filters sync to URL query params so the view is shareable and survives refresh.
- Grid of `EventCard`s (which wrap `TicketStub` in `compact` variant plus an availability badge).
- Availability badge: >20% seats free → neutral "N seats left"; ≤20% → pending "Few left"; 0 → cancelled "Sold out".
- Pagination controls; page state in the URL.
- Empty state: "No concerts match your search" with a "Clear filters" action.

### `EventDetailPage`
- Header: eyebrow date, marquee title (34px `--font-voice`), artist, venue, formatted price.
- Two-column desktop layout (`SeatMap` left, `SelectionSummary` right); single column stacked on mobile with a sticky summary bar.
- A live connection indicator: a small dot plus "Live" when `isConnected`, "Reconnecting…" otherwise. This makes the WebSocket visible in your demo video — worth having.
- If `event.status === 'cancelled'`, replace the map with a cancelled notice.
- If the user is anonymous and clicks "Continue to checkout", route to `/login` with `state.from` set so they return here after signing in.

### `CheckoutPage`
- Read-only summary of event and selected seats using `TicketStub`.
- Simulated payment section: cardholder name and a card-number field that **accepts only the literal test value `4242 4242 4242 4242`**. Render a clear notice: "Simulated payment — no real card details are collected or transmitted." **Never** build a field that could receive a real card number without that notice.
- Submit → `POST /api/bookings`.
- **On `409 SEAT_UNAVAILABLE`:** show the mapped error message, re-fetch the event, clear the conflicting seats from selection, and route back to the event detail page. Do **not** retry automatically — a blind retry can double-book.
- Guard: if the user lands here with no selection, redirect to the event page.

### `ConfirmationPage`
- Large full-variant `TicketStub` per booked seat.
- Booking reference prominent in mono.
- Actions: "View my bookings", "Browse more concerts".

### `MyBookingsPage`
- List of compact `TicketStub`s with a status `Badge`.
- Cancel action opens a `Modal` requiring confirmation. On success, refresh the list and toast "Booking cancelled".
- Empty state: "You haven't booked any concerts yet" with a browse action.

### `LoginPage` / `RegisterPage`
- Centred card, max-width 420px.
- Client-side validation: email format, password minimum 8 characters, name 2–80 characters. Validate on blur and on submit — never on every keystroke.
- Show a single generic error on failed login. **Never reveal whether the email exists** — that is an enumeration vulnerability, and this mirrors the server behaviour specified in FR-2.
- Disable submit and show button loading state during the request.
- Link across to the other page.

### `ProfilePage`
- View and edit name and email. Password change is out of scope.
- Account deletion behind a `Modal` requiring the user to type their email to confirm.

### Admin pages
- `AdminDashboardPage`: stat cards (total events, upcoming, total bookings, utilisation %), plus links to the sections.
- `AdminEventsPage`: table with edit/delete actions; delete behind a confirm modal.
- `AdminEventFormPage`: create/edit form — title, artist, date (must be future), base price (≥0), venue select. Full client-side validation with inline errors.
- `AdminVenuesPage`: CRUD table. On `409 VENUE_IN_USE`, explain that events reference this venue.
- `AdminBookingsPage`: paginated table of all bookings, filterable by event.

---

## 10. Accessibility — mandatory

These are assessed under NFR-11/NFR-12 and are cheap to get right if done from the start.

- Every interactive element is a real `<button>`, `<a>`, or form control. **Zero `onClick` handlers on `<div>`.**
- Every input has an associated `<label>`. Icon-only buttons have `aria-label`.
- Visible focus indicator on everything focusable: `outline: 2px solid var(--ink); outline-offset: 2px`. Never `outline: none` without a replacement.
- Logical heading hierarchy — one `<h1>` per page, no skipped levels.
- Colour contrast ≥4.5:1 for body text. Verify `--text-muted` on `--bg` and darken it if it fails.
- Status changes announced via `aria-live`. Seat map updates, toasts, and form errors all need it.
- Full keyboard operability: every flow, including seat selection and modals, completable without a mouse.
- Respect `prefers-reduced-motion` on every transition and animation.
- A "Skip to main content" link as the first focusable element.

---

## 11. Testing requirements

Write tests as you build each component, not afterwards. Target ≥60% coverage on the client.

**Required test files:**

| File | Must assert |
|---|---|
| `SeatMap.test.tsx` | Renders one button per seat; clicking available selects; clicking taken does nothing; `seats:updated` re-renders affected seats; a remotely-taken selected seat is dropped from selection |
| `Seat.test.tsx` | Correct `aria-label` per state; `aria-pressed` reflects selection; taken seat is `aria-disabled` |
| `TicketStub.test.tsx` | Renders all fields and serial; compact variant hides fields; renders as a button when `onClick` is given |
| `LoginForm.test.tsx` | Inline error on invalid email; error clears on edit; submit disabled while loading; generic message on 401 |
| `CheckoutPage.test.tsx` | 409 shows the conflict message and does not retry; redirects when selection is empty |
| `ProtectedRoute.test.tsx` | Renders spinner while loading; redirects when anonymous; preserves `from` location |
| `EventList.test.tsx` | Empty state when no results; filters update the URL |
| `a11y.test.tsx` | `jest-axe` reports zero violations on EventList, EventDetail, Login, Checkout |

Mock the API with MSW or typed Axios mocks. Mock the socket with a small fake emitter so `seats:updated` can be dispatched deterministically in tests.

---

## 12. Hard constraints — do not violate

1. **No CSS framework.** No Bootstrap, Tailwind, MUI, Chakra. Plain CSS with the token variables.
2. **No state library.** Context + `useReducer` only.
3. **No hard-coded colours, radii, or font stacks** outside `tokens.css`.
4. **No `any`** on any API boundary type.
5. **No `onClick` on non-interactive elements.**
6. **No secrets in client code.** Only `VITE_`-prefixed env vars, and never a database URI or JWT signing secret — anything in the client bundle is public.
7. **No personal data in URL query strings.**
8. **No automatic retry on booking creation.**
9. **No real payment card handling.** Simulated only, clearly labelled.
10. **Client-side route guards are UX, not security.** The server authorises.
11. **Every list renders an empty state.** No blank areas.
12. **Every async view renders loading, error, empty, and success states.**
13. **Clean up every socket listener and every effect subscription.**
14. **Two font weights only** (400, 500). Sentence case throughout.

---

## 13. Build order

Work in this sequence — each step is testable before the next begins:

1. Vite + TypeScript strict + ESLint + Vitest scaffold; `tokens.css`; `global.css`.
2. `types/api.ts` — the full contract, before any component.
3. `lib/` — apiClient, errors, formatters.
4. UI primitives: Button, Input, Select, Badge, Card, Spinner, EmptyState, ErrorState, Modal, Toast.
5. `TicketStub` — the signature component, with its test.
6. AuthContext + ToastContext; Login, Register, ProtectedRoute.
7. AppShell, Header, Footer, routing skeleton.
8. EventListPage with filters and pagination.
9. SocketContext.
10. `useEventSeats`, Seat, SeatMap, SeatLegend, SelectionSummary, EventDetailPage — **verify live updates across two browser windows before moving on**.
11. CheckoutPage including the 409 conflict path.
12. ConfirmationPage, MyBookingsPage, ProfilePage.
13. Admin pages.
14. Accessibility pass — keyboard, axe, contrast.
15. Coverage push to target; fix gaps.

---

## 14. Definition of done

The frontend is complete when all of the following are true:

- [ ] `tsc --noEmit` passes with zero errors under strict mode.
- [ ] ESLint passes with zero errors.
- [ ] All specified tests pass; client coverage ≥60%.
- [ ] `jest-axe` reports zero violations on the four key pages.
- [ ] Every flow is completable using only a keyboard.
- [ ] Booking a seat in one browser window turns it grey in a second window within one second, with no refresh.
- [ ] A 409 conflict shows a clear message, refreshes the map, and does not double-book.
- [ ] Refreshing any protected page while logged in does not bounce to `/login`.
- [ ] All four states render correctly on every async view.
- [ ] No hard-coded colour exists outside `tokens.css`.
- [ ] The app builds cleanly and runs in its Docker container against the deployed API.