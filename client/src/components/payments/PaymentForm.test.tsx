// `@stripe/react-stripe-js` is mocked globally in setupTests.ts — `useStripe`/
// `useElements` there are already vi.fn()s, so each scenario below just
// points `useStripe`'s return value at the state under test instead of
// trying to drive Stripe's real Payment Element. `Elements`/`PaymentElement`
// are inert stand-ins, so this suite drives PaymentFormInner's own logic
// directly (ADR-014's plain Elements + confirmPayment flow, not the old
// embedded Checkout Sessions API).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useElements, useStripe } from '@stripe/react-stripe-js'
import { http, HttpResponse } from 'msw'
import { PaymentForm } from './PaymentForm'
import { server } from '@/test/mocks/server'

const mockedUseStripe = vi.mocked(useStripe)
const mockedUseElements = vi.mocked(useElements)

function Destination({ label }: { label: string }) {
  return <p>{label}</p>
}

function renderForm(expiresAt: string, holdId = 'hold-1', onExpire?: () => void) {
  return render(
    <MemoryRouter initialEntries={[`/checkout/${holdId}`]}>
      <Routes>
        <Route
          path="/checkout/:holdId"
          element={
            <PaymentForm
              holdId={holdId}
              clientSecret="pi_test_secret"
              publishableKey="pk_test_x"
              expiresAt={expiresAt}
              onExpire={onExpire}
            />
          }
        />
        <Route path="/confirmation/:bookingId" element={<Destination label="confirmation" />} />
      </Routes>
    </MemoryRouter>,
  )
}

const future = (ms = 5 * 60 * 1000) => new Date(Date.now() + ms).toISOString()

describe('PaymentForm', () => {
  beforeEach(() => {
    mockedUseElements.mockReturnValue({} as ReturnType<typeof useElements>)
  })

  it('shows an inline error instead of the form when no publishable key is available', () => {
    render(
      <MemoryRouter>
        <PaymentForm holdId="hold-1" clientSecret="pi_test_secret" publishableKey={null} expiresAt={future()} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/payment is currently unavailable/i)
  })

  it('confirms payment, confirms the booking server-side, and navigates to the resolved confirmation page', async () => {
    const confirmPayment = vi.fn().mockResolvedValue({ paymentIntent: { status: 'succeeded' } })
    mockedUseStripe.mockReturnValue({ confirmPayment } as unknown as ReturnType<typeof useStripe>)
    server.use(http.post('/api/bookings/confirm', () => HttpResponse.json({ booking: { id: 'booking-99' } })))

    const user = userEvent.setup()
    renderForm(future())

    await user.click(screen.getByRole('button', { name: /pay now/i }))

    expect(confirmPayment).toHaveBeenCalledWith(expect.objectContaining({ redirect: 'if_required' }))
    await waitFor(() => expect(screen.getByText('confirmation')).toBeInTheDocument())
  })

  it('treats a "processing" PaymentIntent the same as "succeeded" and still confirms the booking', async () => {
    const confirmPayment = vi.fn().mockResolvedValue({ paymentIntent: { status: 'processing' } })
    mockedUseStripe.mockReturnValue({ confirmPayment } as unknown as ReturnType<typeof useStripe>)
    server.use(http.post('/api/bookings/confirm', () => HttpResponse.json({ booking: { id: 'booking-99' } })))

    const user = userEvent.setup()
    renderForm(future())

    await user.click(screen.getByRole('button', { name: /pay now/i }))
    await waitFor(() => expect(screen.getByText('confirmation')).toBeInTheDocument())
  })

  it('shows the decline reason and stays on the page when Stripe reports an error', async () => {
    const confirmPayment = vi.fn().mockResolvedValue({ error: { message: 'Your card was declined.' } })
    mockedUseStripe.mockReturnValue({ confirmPayment } as unknown as ReturnType<typeof useStripe>)

    const user = userEvent.setup()
    renderForm(future())

    await user.click(screen.getByRole('button', { name: /pay now/i }))
    expect(await screen.findByText('Your card was declined.')).toBeInTheDocument()
    // The hold is still live — no booking-confirm call, no navigation.
    expect(screen.getByRole('button', { name: /pay now/i })).toBeInTheDocument()
  })

  it('offers a safe retry when the server cannot confirm the booking yet, and retrying succeeds', async () => {
    const confirmPayment = vi.fn().mockResolvedValue({ paymentIntent: { status: 'succeeded' } })
    mockedUseStripe.mockReturnValue({ confirmPayment } as unknown as ReturnType<typeof useStripe>)

    let confirmCalls = 0
    server.use(
      http.post('/api/bookings/confirm', () => {
        confirmCalls += 1
        if (confirmCalls === 1) {
          return HttpResponse.json(
            { error: { code: 'PAYMENT_NOT_SUCCEEDED', message: 'Unable to confirm this booking yet.' } },
            { status: 409 },
          )
        }
        return HttpResponse.json({ booking: { id: 'booking-99' } })
      }),
    )

    const user = userEvent.setup()
    renderForm(future())

    await user.click(screen.getByRole('button', { name: /pay now/i }))
    expect(await screen.findByText(/unable to confirm this booking yet/i)).toBeInTheDocument()
    // confirmPayment is never re-run on retry — only the idempotent server confirm.
    expect(confirmPayment).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: /try confirming again/i }))

    await waitFor(() => expect(screen.getByText('confirmation')).toBeInTheDocument())
    expect(confirmCalls).toBe(2)
    expect(confirmPayment).toHaveBeenCalledTimes(1)
  })

  it('disables the pay button once the hold countdown reaches zero and reports the expiry', async () => {
    // HoldCountdown's expiry check runs in a passive effect scheduled via
    // React's own scheduler (MessageChannel-based), which fake timers don't
    // drive — so this uses a short REAL countdown instead of vi.useFakeTimers.
    const onExpire = vi.fn()
    mockedUseStripe.mockReturnValue({ confirmPayment: vi.fn() } as unknown as ReturnType<typeof useStripe>)

    renderForm(future(1000), 'hold-1', onExpire)

    await waitFor(() => expect(onExpire).toHaveBeenCalledTimes(1), { timeout: 3000 })
    expect(screen.getByRole('button', { name: /pay now/i })).toBeDisabled()
  })
})
