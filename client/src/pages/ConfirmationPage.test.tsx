import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { ConfirmationPage, ReconcilingConfirmation } from './ConfirmationPage'
import { renderPage, renderRoutes } from '@/test/utils'
import { server } from '@/test/mocks/server'
import { getLastFakeSocket } from '@/test/mocks/socket'
import { bookingConfirmed } from '@/test/fixtures'

// ReconcilingConfirmation accepts short pollIntervalMs/pollTimeoutMs overrides
// (defaulting to the real production cadence) specifically so these tests can
// drive it with real, fast waits rather than fake timers — vi.useFakeTimers()
// doesn't reliably combine with this project's testing-library `waitFor`/
// `findBy*` polling, since passive effects and internal polling both rely on
// the very timer functions being faked without anything advancing them.
function renderReconciling(holdId = 'hold-1') {
  return renderRoutes(
    [
      { path: '/reconciling', element: <ReconcilingConfirmation holdId={holdId} pollIntervalMs={30} pollTimeoutMs={150} /> },
      { path: '/confirmation/:bookingId', element: <ConfirmationPage /> },
    ],
    { route: '/reconciling' },
  )
}

describe('ConfirmationPage', () => {
  describe('resolved mode (/confirmation/:bookingId)', () => {
    it('shows a confirmed booking with its seats and total', async () => {
      server.use(http.get('/api/bookings/:id', () => HttpResponse.json({ booking: bookingConfirmed })))
      renderPage(<ConfirmationPage />, '/confirmation/:bookingId', { route: `/confirmation/${bookingConfirmed.id}` })

      expect(await screen.findByRole('heading', { name: /you're going/i })).toBeInTheDocument()
      expect(screen.getAllByText(bookingConfirmed.reference).length).toBeGreaterThan(0)
    })

    it('shows a not-found state for an unknown booking', async () => {
      server.use(
        http.get('/api/bookings/:id', () =>
          HttpResponse.json({ error: { code: 'BOOKING_NOT_FOUND', message: 'Not found.' } }, { status: 404 }),
        ),
      )
      renderPage(<ConfirmationPage />, '/confirmation/:bookingId', { route: '/confirmation/does-not-exist' })

      expect(await screen.findByRole('heading', { name: /booking not found/i })).toBeInTheDocument()
    })
  })

  describe('reconciling mode', () => {
    it('shows a calm "confirming" state while polling', async () => {
      server.use(
        http.get('/api/bookings/by-hold/:holdId', () =>
          HttpResponse.json({ error: { code: 'BOOKING_NOT_FOUND', message: 'Still reconciling.' } }, { status: 404 }),
        ),
      )
      renderReconciling()

      expect(await screen.findByRole('heading', { name: /confirming your booking/i })).toBeInTheDocument()
    })

    it('resolves once the poll finds the booking, navigating to /confirmation/:bookingId', async () => {
      let calls = 0
      server.use(
        http.get('/api/bookings/by-hold/:holdId', () => {
          calls += 1
          if (calls < 2) {
            return HttpResponse.json({ error: { code: 'BOOKING_NOT_FOUND', message: 'Still reconciling.' } }, { status: 404 })
          }
          return HttpResponse.json({ booking: bookingConfirmed })
        }),
        http.get('/api/bookings/:id', () => HttpResponse.json({ booking: bookingConfirmed })),
      )
      renderReconciling()

      await screen.findByRole('heading', { name: /confirming your booking/i })

      await waitFor(() => expect(calls).toBeGreaterThanOrEqual(2))
      expect(await screen.findByRole('heading', { name: /you're going/i })).toBeInTheDocument()
    })

    it('resolves immediately on a booking:confirmed socket push, without waiting for the next poll', async () => {
      server.use(
        http.get('/api/bookings/by-hold/:holdId', () =>
          HttpResponse.json({ error: { code: 'BOOKING_NOT_FOUND', message: 'Still reconciling.' } }, { status: 404 }),
        ),
        http.get('/api/bookings/:id', () => HttpResponse.json({ booking: bookingConfirmed })),
      )
      renderReconciling('hold-1')
      await screen.findByRole('heading', { name: /confirming your booking/i })

      const socket = getLastFakeSocket()
      socket.trigger('booking:confirmed', { holdId: 'hold-1', bookingId: bookingConfirmed.id, reference: bookingConfirmed.reference })

      expect(await screen.findByRole('heading', { name: /you're going/i })).toBeInTheDocument()
    })

    it('settles into a calm "still finalising" state after the poll timeout, never an error', async () => {
      server.use(
        http.get('/api/bookings/by-hold/:holdId', () =>
          HttpResponse.json({ error: { code: 'BOOKING_NOT_FOUND', message: 'Still reconciling.' } }, { status: 404 }),
        ),
      )
      renderReconciling()
      await screen.findByRole('heading', { name: /confirming your booking/i })

      expect(await screen.findByRole('heading', { name: /still finalising your booking/i }, { timeout: 2000 })).toBeInTheDocument()
    })
  })

  it('shows a "nothing to confirm" state with neither a bookingId nor a hold', async () => {
    renderPage(<ConfirmationPage />, '/confirmation', { route: '/confirmation' })
    expect(await screen.findByText(/nothing to confirm/i)).toBeInTheDocument()
  })
})
