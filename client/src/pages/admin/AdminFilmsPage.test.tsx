import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { AdminFilmsPage } from './AdminFilmsPage'
import { renderPage } from '@/test/utils'
import { server } from '@/test/mocks/server'
import { filmA, filmB } from '@/test/fixtures'

describe('AdminFilmsPage', () => {
  it('lists films with a search filter', async () => {
    const user = userEvent.setup()
    renderPage(<AdminFilmsPage />, '/admin/films')
    await screen.findByText(filmA.title)
    expect(screen.getByText(filmB.title)).toBeInTheDocument()

    await user.type(screen.getByLabelText(/search films/i), filmA.genre[0])
    expect(screen.getByText(filmA.title)).toBeInTheDocument()
    expect(screen.queryByText(filmB.title)).not.toBeInTheDocument()
  })

  it('opens and cancels the delete confirmation modal', async () => {
    const user = userEvent.setup()
    renderPage(<AdminFilmsPage />, '/admin/films')
    await screen.findByText(filmA.title)

    await user.click(screen.getAllByTitle('Delete film')[0])
    expect(await screen.findByRole('dialog')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^cancel$/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('surfaces FILM_IN_USE instead of deleting when the film has showtimes', async () => {
    server.use(
      http.delete('/api/films/:id', () =>
        HttpResponse.json(
          { error: { code: 'FILM_IN_USE', message: 'in use', details: { referencingShowtimesCount: 3 } } },
          { status: 409 },
        ),
      ),
    )
    const user = userEvent.setup()
    renderPage(<AdminFilmsPage />, '/admin/films')
    await screen.findByText(filmA.title)

    await user.click(screen.getAllByTitle('Delete film')[0])
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /^delete film$/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/3 showtimes reference this film/i))
  })
})
