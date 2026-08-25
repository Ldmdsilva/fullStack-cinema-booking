import * as React from 'react'
import { afterAll, afterEach, beforeAll, expect, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { toHaveNoViolations } from 'jest-axe'
import { server } from './mocks/server'
import { createSocket, resetFakeSockets } from './mocks/socket'
import { setToken } from '@/lib/tokenStore'

expect.extend(toHaveNoViolations)

// --- MSW ---
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

// --- RTL cleanup ---
// @testing-library/react only wires this up automatically when it finds a
// global `afterEach` — this project runs Vitest with `globals: false`, so
// it's done explicitly here instead.
afterEach(() => cleanup())

// --- Reset shared module-level state between tests ---
afterEach(() => {
  resetFakeSockets()
  setToken(null)
  window.localStorage.clear()
  window.sessionStorage.clear()
})

// --- Socket.IO ---
// SocketProvider (src/context/SocketContext.tsx) only ever touches on/off/
// emit/connect/disconnect/auth/io.on/io.off — see src/test/mocks/socket.ts
// for the deterministic fake standing in for the real transport.
vi.mock('@/lib/socket', () => ({ createSocket }))

// --- Stripe ---
// CheckoutPage always imports PaymentForm, which calls loadStripe() at
// module scope — left real, that reaches out to js.stripe.com on every test
// run. None of this suite's scenarios need the actual Payment Element to
// mount (see CheckoutPage.test.tsx), so both vendor modules are replaced
// with inert stand-ins; PaymentForm.test.tsx drives the form's own logic
// against controllable `useStripe`/`useElements` results (ADR-014's plain
// Elements/PaymentElement/confirmPayment flow, not the old Checkout
// Sessions API).
vi.mock('@stripe/stripe-js', () => ({
  loadStripe: vi.fn(() => Promise.resolve(null)),
}))

vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  PaymentElement: () => null,
  useStripe: vi.fn(() => ({
    confirmPayment: vi.fn().mockResolvedValue({ paymentIntent: { status: 'succeeded' } }),
  })),
  useElements: vi.fn(() => ({})),
}))
