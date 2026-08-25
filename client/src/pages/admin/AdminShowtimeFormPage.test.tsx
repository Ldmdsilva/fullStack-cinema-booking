import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdminShowtimeFormPage } from './AdminShowtimeFormPage'
import { renderPage } from '@/test/utils'
import { filmA, cinemaA } from '@/test/fixtures'

describe('AdminShowtimeFormPage', () => {
  it('validates required fields before submitting', async () => {
    const user = userEvent.setup()
    renderPage(<AdminShowtimeFormPage />, '/admin/showtimes/new')
    await screen.findByRole('heading', { name: /create showtime/i })

    await user.click(screen.getByRole('button', { name: /create showtime/i }))

    expect(await screen.findByText(/select a film/i)).toBeInTheDocument()
    expect(screen.getByText(/select a cinema/i)).toBeInTheDocument()
    expect(screen.getByText(/start time is required/i)).toBeInTheDocument()
  })

  it('cascades film -> cinema -> screen and shows a live tier-price preview', async () => {
    const user = userEvent.setup()
    renderPage(<AdminShowtimeFormPage />, '/admin/showtimes/new')
    await screen.findByRole('heading', { name: /create showtime/i })

    await screen.findByRole('option', { name: new RegExp(filmA.title) })
    await user.selectOptions(screen.getByLabelText(/^film$/i), filmA.id)

    await screen.findByRole('option', { name: new RegExp(cinemaA.name) })
    await user.selectOptions(screen.getByLabelText(/^cinema$/i), cinemaA.id)

    // Screens only populate once the full Cinema (with screens) loads.
    await screen.findByRole('option', { name: new RegExp(cinemaA.screens[0].name) })
    await user.selectOptions(screen.getByLabelText(/^screen$/i), cinemaA.screens[0].screenId)

    await user.type(screen.getByLabelText(/starts at/i), '2026-12-01T20:00')
    await user.type(screen.getByLabelText(/base price/i), '1500')

    expect(await screen.findByText(/standard:/i)).toBeInTheDocument()
    expect(screen.getByText(/premium:/i)).toBeInTheDocument()
    expect(screen.getByText(/recliner:/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /create showtime/i }))

    await waitFor(() => expect(screen.queryByText(/select a film/i)).not.toBeInTheDocument())
  })
})
