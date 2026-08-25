import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { FilmListPage } from './FilmListPage'
import { AuthProvider } from '@/context/AuthContext'
import { SocketProvider } from '@/context/SocketContext'
import { ToastProvider } from '@/components/ui/toast'
import { server } from '@/test/mocks/server'
import { filmA, filmB } from '@/test/fixtures'

// FilmListPage drives its filters through useSearchParams — MemoryRouter
// keeps that state internally rather than on the real `window.location`, so
// a sibling reading `useLocation()` is what makes it observable in a test.
function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname + location.search}</div>
}

function renderFilmList() {
  return render(
    <MemoryRouter initialEntries={['/films']}>
      <AuthProvider>
        <SocketProvider>
          <ToastProvider>
            <FilmListPage />
            <LocationDisplay />
          </ToastProvider>
        </SocketProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('FilmListPage', () => {
  it('lists films returned by the server', async () => {
    renderFilmList()
    expect(await screen.findByText(filmA.title)).toBeInTheDocument()
    expect(await screen.findByText(filmB.title)).toBeInTheDocument()
  })

  it('shows an empty state when a filter matches nothing, with a way to clear it', async () => {
    const user = userEvent.setup({ delay: null })
    renderFilmList()
    await screen.findByText(filmA.title)

    // Neither fixture film is tagged Comedy — this genre yields zero results.
    await user.selectOptions(screen.getByLabelText(/genre/i), 'Comedy')

    expect(await screen.findByText(/no films match your search/i, {}, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /clear filters/i }))
    expect(await screen.findByText(filmA.title, {}, { timeout: 5000 })).toBeInTheDocument()
  })

  it('reflects filter changes in the URL so a search is shareable', async () => {
    const user = userEvent.setup({ delay: null })
    renderFilmList()
    await screen.findByText(filmA.title)

    await user.selectOptions(screen.getByLabelText(/genre/i), 'Music')
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('genre=Music'))

    await user.type(screen.getByLabelText(/search/i), 'Marfa')
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('q=Marfa'), { timeout: 5000 })
  })

  it('filters films by title via the search box', async () => {
    const user = userEvent.setup({ delay: null })
    renderFilmList()
    await screen.findByText(filmA.title)

    await user.type(screen.getByLabelText(/search/i), 'Night Choir')
    await waitFor(() => expect(screen.queryByText(filmA.title)).not.toBeInTheDocument(), { timeout: 5000 })
    expect(screen.getByText(filmB.title)).toBeInTheDocument()
  })

  it('paginates when the server reports more than one page', async () => {
    const user = userEvent.setup({ delay: null })
    server.use(
      http.get('/api/films', ({ request }) => {
        const url = new URL(request.url)
        const page = Number(url.searchParams.get('page') ?? '1')
        const items = page === 1 ? [filmA] : [filmB]
        return HttpResponse.json({ items, total: 2, page, limit: 1, totalPages: 2 })
      }),
    )
    renderFilmList()

    expect(await screen.findByText(filmA.title)).toBeInTheDocument()
    expect(screen.getByText(/page 1 of 2/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /next/i }))
    expect(await screen.findByText(filmB.title)).toBeInTheDocument()
    expect(screen.getByText(/page 2 of 2/i)).toBeInTheDocument()
  })
})
