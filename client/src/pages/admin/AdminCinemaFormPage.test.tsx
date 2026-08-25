import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdminCinemaFormPage } from './AdminCinemaFormPage'
import { renderPage } from '@/test/utils'
import { cinemaA } from '@/test/fixtures'

describe('AdminCinemaFormPage', () => {
  it('validates required fields before submitting a new cinema', async () => {
    const user = userEvent.setup()
    renderPage(<AdminCinemaFormPage />, '/admin/cinemas/:id', { route: '/admin/cinemas/new' })
    await screen.findByRole('heading', { name: /create cinema/i })

    await user.click(screen.getByRole('button', { name: /create cinema/i }))

    expect(await screen.findByText(/cinema name is required/i)).toBeInTheDocument()
    expect(screen.getByText(/city is required/i)).toBeInTheDocument()
    expect(screen.getByText(/address is required/i)).toBeInTheDocument()
  })

  it('rejects a screen seat layout over the 300-seat limit', async () => {
    const user = userEvent.setup()
    renderPage(<AdminCinemaFormPage />, '/admin/cinemas/:id', { route: '/admin/cinemas/new' })
    await screen.findByRole('heading', { name: /create cinema/i })

    await user.type(screen.getByLabelText(/cinema name/i), 'Big Multiplex')
    await user.type(screen.getByLabelText(/^city$/i), 'Colombo')
    await user.type(screen.getByLabelText(/full address/i), '1 Main St')

    const seatsPerRowInputs = screen.getAllByLabelText(/seats per row/i)
    await user.clear(seatsPerRowInputs[0])
    await user.type(seatsPerRowInputs[0], '50')
    const rowsInputs = screen.getAllByLabelText(/rows \(comma-sep\)/i)
    await user.clear(rowsInputs[0])
    await user.type(rowsInputs[0], 'A,B,C,D,E,F,G')

    await user.click(screen.getByRole('button', { name: /create cinema/i }))
    expect(await screen.findByText(/exceeds the 300-seat limit/i)).toBeInTheDocument()
  })

  it('creates a cinema with the default single screen', async () => {
    const user = userEvent.setup()
    renderPage(<AdminCinemaFormPage />, '/admin/cinemas/:id', { route: '/admin/cinemas/new' })
    await screen.findByRole('heading', { name: /create cinema/i })

    await user.type(screen.getByLabelText(/cinema name/i), 'Small House')
    await user.type(screen.getByLabelText(/^city$/i), 'Galle')
    await user.type(screen.getByLabelText(/full address/i), '1 Main St')

    await user.click(screen.getByRole('button', { name: /create cinema/i }))
    await waitFor(() => expect(screen.queryByText(/cinema name is required/i)).not.toBeInTheDocument())
  })

  it('loads an existing cinema into the form when editing', async () => {
    renderPage(<AdminCinemaFormPage />, '/admin/cinemas/:id/edit', { route: `/admin/cinemas/${cinemaA.id}/edit` })
    expect(await screen.findByDisplayValue(cinemaA.name)).toBeInTheDocument()
    expect(screen.getByDisplayValue(cinemaA.city)).toBeInTheDocument()
  })

  it('adds, duplicates, and removes screens', async () => {
    const user = userEvent.setup()
    renderPage(<AdminCinemaFormPage />, '/admin/cinemas/:id', { route: '/admin/cinemas/new' })
    await screen.findByRole('heading', { name: /create cinema/i })

    const before = screen.getAllByLabelText(/screen id/i).length
    await user.click(screen.getByRole('button', { name: /add screen/i }))
    expect(screen.getAllByLabelText(/screen id/i)).toHaveLength(before + 1)

    await user.click(screen.getAllByTitle('Duplicate screen')[0])
    expect(screen.getAllByLabelText(/screen id/i)).toHaveLength(before + 2)

    await user.click(screen.getAllByTitle('Remove screen')[0])
    expect(screen.getAllByLabelText(/screen id/i)).toHaveLength(before + 1)
  })

  it('adds and removes seat sections within a screen, and has no priceMult field', () => {
    renderPage(<AdminCinemaFormPage />, '/admin/cinemas/:id', { route: '/admin/cinemas/new' })
    expect(screen.queryByLabelText(/price mult/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/price multiplier/i)).not.toBeInTheDocument()
  })
})
