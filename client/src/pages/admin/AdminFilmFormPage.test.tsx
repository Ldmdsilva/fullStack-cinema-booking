import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdminFilmFormPage } from './AdminFilmFormPage'
import { renderPage } from '@/test/utils'
import { filmA } from '@/test/fixtures'

describe('AdminFilmFormPage', () => {
  it('validates required fields before submitting a new film', async () => {
    const user = userEvent.setup()
    renderPage(<AdminFilmFormPage />, '/admin/films/:id', { route: '/admin/films/new' })
    await screen.findByRole('heading', { name: /create film/i })

    await user.click(screen.getByRole('button', { name: /create film/i }))

    expect(await screen.findByText(/title is required/i)).toBeInTheDocument()
    expect(screen.getByText(/synopsis is required/i)).toBeInTheDocument()
    expect(screen.getByText(/at least one genre is required/i)).toBeInTheDocument()
    expect(screen.getByText(/release date is required/i)).toBeInTheDocument()
  })

  it('creates a new film once the form is valid', async () => {
    const user = userEvent.setup()
    renderPage(<AdminFilmFormPage />, '/admin/films/:id', { route: '/admin/films/new' })
    await screen.findByRole('heading', { name: /create film/i })

    await user.type(screen.getByLabelText(/^title$/i), 'New Film')
    await user.type(screen.getByLabelText(/genre \(comma-separated\)/i), 'Drama')
    await user.type(screen.getByLabelText(/synopsis/i), 'A short synopsis.')
    await user.type(screen.getByLabelText(/runtime \(minutes\)/i), '100')
    await user.type(screen.getByLabelText(/release date/i), '2026-12-01')

    await user.click(screen.getByRole('button', { name: /create film/i }))

    await waitFor(() => expect(screen.queryByText(/title is required/i)).not.toBeInTheDocument())
  })

  it('loads an existing film into the form when editing', async () => {
    renderPage(<AdminFilmFormPage />, '/admin/films/:id/edit', { route: `/admin/films/${filmA.id}/edit` })
    expect(await screen.findByDisplayValue(filmA.title)).toBeInTheDocument()
    expect(screen.getByDisplayValue(filmA.genre.join(', '))).toBeInTheDocument()
  })
})
