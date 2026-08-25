import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdminBookingsPage } from './AdminBookingsPage'
import { renderPage } from '@/test/utils'
import { bookingConfirmed, bookingCancelled } from '@/test/fixtures'

describe('AdminBookingsPage', () => {
  it('lists all bookings and filters by status', async () => {
    const user = userEvent.setup()
    renderPage(<AdminBookingsPage />, '/admin/bookings')
    await screen.findByText(bookingCancelled.reference)
    expect(screen.getByText(bookingConfirmed.reference)).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText(/status/i), 'confirmed')
    expect(screen.getByText(bookingConfirmed.reference)).toBeInTheDocument()
    expect(screen.queryByText(bookingCancelled.reference)).not.toBeInTheDocument()
  })

  it('filters by a text search across customer, ref, and showtime', async () => {
    const user = userEvent.setup()
    renderPage(<AdminBookingsPage />, '/admin/bookings')
    await screen.findByText(bookingCancelled.reference)

    await user.type(screen.getByLabelText(/search \(this page\)/i), bookingCancelled.reference)
    expect(screen.getByText(bookingCancelled.reference)).toBeInTheDocument()
    expect(screen.queryByText(bookingConfirmed.reference)).not.toBeInTheDocument()
  })
})
