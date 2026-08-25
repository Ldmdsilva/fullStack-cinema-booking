# Encore Cinemas — client

React 19 + Vite + Tailwind CSS v4 client for Encore Cinemas, a cinema
ticket-booking app. This started from a Figma Make scaffold but has since
been migrated off that domain (concerts → cinema) and grown well past the
original scaffold's shape — treat this file, not the Figma Make defaults,
as the source of truth.

## Running it

`npm run dev` starts the Vite dev server (not already running for you —
start it yourself). The server expects the API at `VITE_API_URL` and Stripe
at `VITE_STRIPE_PUBLISHABLE_KEY` (see the root `README.md` for the exact
gotcha around where that second one needs to be set).

## Project structure

- `src/main.tsx` — React entrypoint; imports `src/index.css` and mounts `src/App.tsx`
- `src/App.tsx` — route table (public/customer shell + admin shell), composed from `src/routes/*` guards and `src/pages/*` page components
- `src/routes/` — `ProtectedRoute`, `AdminRoute`, `VerifiedRoute` (email-verification gate)
- `src/pages/` — one file per route; `src/pages/admin/` holds the admin CRUD pages
- `src/components/` — `seats/` (seat map), `payments/` (Stripe Elements + PaymentIntent flow), `layout/` (`AppShell`/`AdminShell`), `ui/` (shared primitives)
- `src/context/` — `AuthContext` (JWT session state), `SocketContext` (Socket.IO connection, showtime rooms)
- `src/hooks/` — `useAsync` (generic fetch-to-render-state), `useShowtimeSeats` (live seat-map state for one showtime)
- `src/lib/types.ts` — the full client-side API contract (Film/Cinema/Showtime/Hold/Booking), audited directly against the server
- `src/lib/tiers.ts` — seat-tier display constants (mirrors `server/src/config/seatTiers.js`)
- `src/lib/api/` — one module per resource (`films.ts`, `cinemas.ts`, `showtimes.ts`, `holds.ts`, `bookings.ts`, `auth.ts`, `admin.ts`, `dev.ts`), all built on the shared `client.ts` axios wrapper
- `src/index.css` — global CSS entrypoint, Tailwind v4 theme tokens, design-system custom properties
- `src/test/` — MSW handlers/fixtures and the `renderPage`/`renderRoutes` test harness
- `vite.config.ts` — Vite config (`@tailwindcss/vite` plugin, `@` alias for `src`)

## Dependencies

- Runtime: React 19, React Router 7, `@stripe/react-stripe-js` + `@stripe/stripe-js` (Elements + PaymentIntent, not embedded Checkout), `socket.io-client`, `axios`
- Styling: Tailwind CSS v4 via `@tailwindcss/vite` — no separate Tailwind/PostCSS config file; tokens live in `src/index.css`'s `@theme inline` block
- Testing: Vitest, Testing Library, MSW, jest-axe

## Code quality

- This codebase uses **named exports** for components (`export function HomePage()`), not default exports — match that convention.
- Use double quotes for strings containing apostrophes, or escape them in single-quoted strings.
- Ensure JSX tags are closed and braces are balanced.
- The seat `aria-label` grammar in `src/components/seats/Seat.tsx` is frozen byte-for-byte (e2e specs and `Seat.test.tsx` depend on its anchors) — never reorder or reword it; add new information via `aria-describedby` instead.
