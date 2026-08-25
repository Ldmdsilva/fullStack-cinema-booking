import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { AdminCinemasPage } from './AdminCinemasPage'
import { renderPage } from '@/test/utils'
import { server } from '@/test/mocks/server'
import { cinemaSummaryA, cinemaSummaryB } from '@/test/fixtures'

describe('AdminCinemasPage', () => {
  it('lists cinemas with a search filter', async () => {
    const user = userEvent.setup()
    renderPage(<AdminCinemasPage />, '/admin/cinemas')
    await screen.findByText(cinemaSummaryA.name)
    expect(screen.getByText(cinemaSummaryB.name)).toBeInTheDocument()

    await user.type(screen.getByLabelText(/search cinemas/i), cinemaSummaryA.city)
    expect(screen.getByText(cinemaSummaryA.name)).toBeInTheDocument()
    expect(screen.queryByText(cinemaSummaryB.name)).not.toBeInTheDocument()
  })

  it('surfaces CINEMA_IN_USE instead of deleting when the cinema has showtimes', async () => {
    server.use(
      http.delete('/api/cinemas/:id', () =>
        HttpResponse.json(
          { error: { code: 'CINEMA_IN_USE', message: 'in use', details: { referencingShowtimesCount: 2 } } },
          { status: 409 },
        ),
      ),
    )
    const user = userEvent.setup()
    renderPage(<AdminCinemasPage />, '/admin/cinemas')
    await screen.findByText(cinemaSummaryA.name)

    await user.click(screen.getAllByTitle('Delete cinema')[0])
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /^delete cinema$/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/2 showtimes reference this cinema/i))
  })
})
