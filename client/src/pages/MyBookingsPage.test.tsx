import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MyBookingsPage } from './MyBookingsPage'
import { renderPage } from '@/test/utils'
import { server } from '@/test/mocks/server'
import { bookingCancelled, bookingConfirmed, bookingRefunded } from '@/test/fixtures'

describe('MyBookingsPage', () => {
  it('lists the current bookings', async () => {
    renderPage(<MyBookingsPage />, '/bookings')
    expect(await screen.findByText(bookingConfirmed.reference)).toBeInTheDocument()
  })

  it('shows an empty state with no bookings', async () => {
    server.use(http.get('/api/bookings/me', () => HttpResponse.json({ items: [], total: 0, page: 1, limit: 10, totalPages: 1 })))
    renderPage(<MyBookingsPage />, '/bookings')
    expect(await screen.findByText(/haven't booked any concerts/i)).toBeInTheDocument()
  })

  it('shows a plain Cancelled badge for a cancelled, non-refunded booking', async () => {
    server.use(
      http.get('/api/bookings/me', () =>
        HttpResponse.json({ items: [bookingCancelled], total: 1, page: 1, limit: 10, totalPages: 1 }),
      ),
    )
    renderPage(<MyBookingsPage />, '/bookings')
    await screen.findByText(bookingCancelled.reference)
    expect(screen.getByText('Cancelled')).toBeInTheDocument()
    expect(screen.queryByText('Refunded')).not.toBeInTheDocument()
  })

  it('shows a distinct Refunded badge for a cancelled + refunded booking', async () => {
    server.use(
      http.get('/api/bookings/me', () =>
        HttpResponse.json({ items: [bookingRefunded], total: 1, page: 1, limit: 10, totalPages: 1 }),
      ),
    )
    renderPage(<MyBookingsPage />, '/bookings')
    await screen.findByText(bookingRefunded.reference)
    expect(screen.getByText('Refunded')).toBeInTheDocument()
    expect(screen.queryByText('Cancelled')).not.toBeInTheDocument()
  })

  it('only offers a cancel action for confirmed bookings', async () => {
    server.use(
      http.get('/api/bookings/me', () =>
        HttpResponse.json({
          items: [bookingConfirmed, bookingCancelled],
          total: 2,
          page: 1,
          limit: 10,
          totalPages: 1,
        }),
      ),
    )
    renderPage(<MyBookingsPage />, '/bookings')
    await screen.findByText(bookingConfirmed.reference)
    expect(screen.getAllByRole('button', { name: /cancel booking/i })).toHaveLength(1)
  })

  it('cancels a confirmed booking through the confirmation modal', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/bookings/me', () =>
        HttpResponse.json({ items: [bookingConfirmed], total: 1, page: 1, limit: 10, totalPages: 1 }),
      ),
    )
    renderPage(<MyBookingsPage />, '/bookings')
    await screen.findByText(bookingConfirmed.reference)

    await user.click(screen.getAllByRole('button', { name: /cancel booking/i })[0])
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByText(/event/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /yes, cancel/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('shows the Refunded badge after a cancel action that comes back refunded', async () => {
    const user = userEvent.setup()
    let cancelled = false
    server.use(
      http.get('/api/bookings/me', () =>
        HttpResponse.json({
          items: [cancelled ? bookingRefunded : bookingConfirmed],
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        }),
      ),
      http.patch('/api/bookings/:id/cancel', () => {
        cancelled = true
        return HttpResponse.json({ booking: bookingRefunded })
      }),
    )
    renderPage(<MyBookingsPage />, '/bookings')
    await screen.findByText(bookingConfirmed.reference)

    await user.click(screen.getByRole('button', { name: /cancel booking/i }))
    await user.click(await screen.findByRole('button', { name: /yes, cancel/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByText('Refunded')).toBeInTheDocument()
  })
})
