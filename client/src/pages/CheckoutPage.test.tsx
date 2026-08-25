import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { CheckoutPage } from './CheckoutPage'
import { renderPage } from '@/test/utils'
import { server } from '@/test/mocks/server'
import { holdA } from '@/test/fixtures'
import { formatPrice } from '@/lib/formatters'

function renderCheckout(holdId = holdA.holdId) {
  return renderPage(<CheckoutPage />, '/checkout/:holdId', { route: `/checkout/${holdId}` })
}

describe('CheckoutPage', () => {
  it('loads the hold and shows the seat summary, then reveals the payment form', async () => {
    renderCheckout()

    await screen.findByRole('heading', { name: /checkout/i })
    expect(await screen.findByText(formatPrice(holdA.totalPrice))).toBeInTheDocument()
    for (const seat of holdA.seatSnapshot) {
      expect(screen.getByText(seat.id, { exact: false })).toBeInTheDocument()
    }

    // Payment section renders once the payment-intent fetch resolves.
    await screen.findByText(/test mode/i)
  })

  it('shows a "no longer available" state for a hold that does not exist', async () => {
    renderCheckout('nope')
    expect(await screen.findByText(/this reservation is no longer available/i)).toBeInTheDocument()
  })

  it('shows a "no longer available" state for a hold that is not active', async () => {
    server.use(
      http.get('/api/holds/:id', ({ params }) => HttpResponse.json({ ...holdA, holdId: params.id, status: 'released' })),
    )
    renderCheckout()
    expect(await screen.findByText(/this reservation is no longer available/i)).toBeInTheDocument()
  })

  it('shows an inline error if creating the payment intent fails', async () => {
    server.use(
      http.post('/api/holds/:id/payment-intent', () =>
        HttpResponse.json({ error: { code: 'HOLD_EXPIRED', message: 'This hold has expired.' } }, { status: 409 }),
      ),
    )
    renderCheckout()
    expect(await screen.findByText(/this hold has expired/i)).toBeInTheDocument()
  })
})
