import { describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { FilmDetailPage } from './FilmDetailPage'
import { renderRoutes } from '@/test/utils'
import { AuthProvider } from '@/context/AuthContext'
import { SocketProvider } from '@/context/SocketContext'
import { ToastProvider } from '@/components/ui/toast'
import { server } from '@/test/mocks/server'
import { filmA, cinemaA, cinemaB, cinemaSummaryA, cinemaSummaryB, showtimeSummaryA, showtimeSummaryB } from '@/test/fixtures'
import type { ShowtimeSummary } from '@/lib/types'

// FilmDetailPage drives filters through useSearchParams — a sibling reading
// useLocation() (same trick as FilmListPage.test.tsx) makes that state
// observable from outside.
function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname + location.search}</div>
}

// A raw <FilmDetailPage /> outside a matching <Route> would leave
// useParams().id undefined (unlike FilmListPage, which never reads params) —
// so this route table + LocationDisplay sibling mirrors renderRoutes while
// still exposing the URL for filter-interaction assertions.
function renderFilmDetail(id = filmA.id) {
  return render(
    <MemoryRouter initialEntries={[`/films/${id}`]}>
      <AuthProvider>
        <SocketProvider>
          <ToastProvider>
            <Routes>
              <Route path="/films/:id" element={<FilmDetailPage />} />
            </Routes>
            <LocationDisplay />
          </ToastProvider>
        </SocketProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
}

// Stub landing page so a real navigation to /showtimes/:id is observable.
function ShowtimeStub() {
  const { id } = useParams<{ id: string }>()
  return <div data-testid="landed-showtime">landed:{id}</div>
}

function FilmsListStub() {
  return <div data-testid="landed-films">landed-films</div>
}

function renderFilmDetailWithShowtimeRoute(id = filmA.id) {
  return renderRoutes(
    [
      { path: '/films/:id', element: <FilmDetailPage /> },
      { path: '/showtimes/:id', element: <ShowtimeStub /> },
      { path: '/films', element: <FilmsListStub /> },
    ],
    { route: `/films/${id}` },
  )
}

// Two showtimes for filmA across two different cinemas, on two different
// calendar days, so grouping-by-cinema-then-date is actually exercised.
const showtimeCinemaA: ShowtimeSummary = {
  ...showtimeSummaryA,
  id: 'showtime-cinema-a',
  film: { id: filmA.id, title: filmA.title },
  cinema: { id: cinemaA.id, name: cinemaA.name, city: cinemaA.city },
  startsAt: '2026-09-12T20:00:00.000Z',
}

const showtimeCinemaB: ShowtimeSummary = {
  ...showtimeSummaryB,
  id: 'showtime-cinema-b',
  film: { id: filmA.id, title: filmA.title },
  cinema: { id: cinemaB.id, name: cinemaB.name, city: cinemaB.city },
  startsAt: '2026-09-13T18:00:00.000Z',
  availableSeats: 5,
}

// Mirrors FilmDetailPage.tsx's own `dateKey`/`dateHeading` exactly, so
// assertions and the date-filter input stay correct under any local
// timezone the test runner happens to use (the fixtures' `startsAt` values
// are UTC and can land on a different local calendar day per machine).
function dateKeyLocal(iso: string): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function dateHeadingLocal(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date(iso))
}

function mockShowtimesFor(filmId: string, items: ShowtimeSummary[]) {
  server.use(
    http.get('/api/showtimes', ({ request }) => {
      const url = new URL(request.url)
      let filtered = items
      const qFilmId = url.searchParams.get('filmId')
      const cinemaId = url.searchParams.get('cinemaId')
      const from = url.searchParams.get('from')
      const to = url.searchParams.get('to')
      if (qFilmId) filtered = filtered.filter((s) => s.film?.id === qFilmId)
      if (cinemaId) filtered = filtered.filter((s) => s.cinema?.id === cinemaId)
      if (from && to) filtered = filtered.filter((s) => s.startsAt >= from && s.startsAt <= to)
      return HttpResponse.json({ items: filtered, total: filtered.length, page: 1, limit: 100, totalPages: 1 })
    }),
    http.get('/api/cinemas', () => HttpResponse.json({ items: [cinemaSummaryA, cinemaSummaryB] })),
  )
  return filmId
}

describe('FilmDetailPage', () => {
  it('renders film info once loaded', async () => {
    renderFilmDetail()

    expect(await screen.findByRole('heading', { name: filmA.title })).toBeInTheDocument()
    expect(screen.getByText(new RegExp(filmA.synopsis))).toBeInTheDocument()
    expect(screen.getByText(new RegExp(filmA.certificate))).toBeInTheDocument()
    expect(screen.getByText(/108m|1h 48m/)).toBeInTheDocument()
    for (const g of filmA.genre) {
      expect(screen.getByText(new RegExp(g))).toBeInTheDocument()
    }
  })

  it('groups showtimes by cinema, then by date', async () => {
    mockShowtimesFor(filmA.id, [showtimeCinemaA, showtimeCinemaB])
    renderFilmDetail()
    await screen.findByRole('heading', { name: filmA.title })

    const groupA = await screen.findByTestId(`cinema-group-${cinemaA.id}`)
    expect(within(groupA).getByText(cinemaA.name)).toBeInTheDocument()
    expect(within(groupA).getByText(cinemaA.city)).toBeInTheDocument()
    expect(within(groupA).getByText(dateHeadingLocal(showtimeCinemaA.startsAt))).toBeInTheDocument()

    const groupB = await screen.findByTestId(`cinema-group-${cinemaB.id}`)
    expect(within(groupB).getByText(cinemaB.name)).toBeInTheDocument()
    expect(within(groupB).getByText(dateHeadingLocal(showtimeCinemaB.startsAt))).toBeInTheDocument()
  })

  it('narrows the showtime list when filtering by cinema', async () => {
    const user = userEvent.setup()
    mockShowtimesFor(filmA.id, [showtimeCinemaA, showtimeCinemaB])
    renderFilmDetail()
    await screen.findByRole('heading', { name: filmA.title })
    await screen.findByTestId(`cinema-group-${cinemaB.id}`)

    await user.selectOptions(screen.getByLabelText(/cinema/i), cinemaA.id)

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(`cinema=${cinemaA.id}`))
    await waitFor(() => expect(screen.queryByTestId(`cinema-group-${cinemaB.id}`)).not.toBeInTheDocument())
    expect(screen.getByTestId(`cinema-group-${cinemaA.id}`)).toBeInTheDocument()

    // Clear button appears once a filter is active, and resets it.
    await user.click(screen.getByRole('button', { name: /clear/i }))
    await waitFor(() => expect(screen.getByTestId('location')).not.toHaveTextContent('cinema='))
    expect(await screen.findByTestId(`cinema-group-${cinemaB.id}`)).toBeInTheDocument()
  })

  it('narrows the showtime list when filtering by date', async () => {
    const user = userEvent.setup()
    mockShowtimesFor(filmA.id, [showtimeCinemaA, showtimeCinemaB])
    renderFilmDetail()
    await screen.findByRole('heading', { name: filmA.title })
    await screen.findByTestId(`cinema-group-${cinemaB.id}`)

    const filterDate = dateKeyLocal(showtimeCinemaA.startsAt)
    const dateInput = screen.getByLabelText(/date/i)
    await user.type(dateInput, filterDate)

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(`date=${filterDate}`))
    await waitFor(() => expect(screen.queryByTestId(`cinema-group-${cinemaB.id}`)).not.toBeInTheDocument())
    expect(await screen.findByTestId(`cinema-group-${cinemaA.id}`)).toBeInTheDocument()
  })

  it('navigates to /showtimes/:id when a showtime is clicked', async () => {
    const user = userEvent.setup()
    mockShowtimesFor(filmA.id, [showtimeCinemaA])
    renderFilmDetailWithShowtimeRoute()
    await screen.findByRole('heading', { name: filmA.title })

    const group = await screen.findByTestId(`cinema-group-${cinemaA.id}`)
    await user.click(within(group).getByText(/from rs/i))

    expect(await screen.findByTestId('landed-showtime')).toHaveTextContent(`landed:${showtimeCinemaA.id}`)
  })

  it('disables a sold-out showtime and does not navigate on click', async () => {
    const user = userEvent.setup()
    const soldOut: ShowtimeSummary = { ...showtimeCinemaA, availableSeats: 0 }
    mockShowtimesFor(filmA.id, [soldOut])
    renderFilmDetailWithShowtimeRoute()
    await screen.findByRole('heading', { name: filmA.title })

    const group = await screen.findByTestId(`cinema-group-${cinemaA.id}`)
    const button = within(group).getByText(/sold out/i).closest('button')!
    expect(button).toBeDisabled()

    await user.click(button)
    expect(screen.queryByTestId('landed-showtime')).not.toBeInTheDocument()
  })

  it('shows an empty state when the film has no upcoming showtimes', async () => {
    mockShowtimesFor(filmA.id, [])
    renderFilmDetail()
    await screen.findByRole('heading', { name: filmA.title })

    expect(await screen.findByText(/no upcoming showtimes for this film/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /clear filters/i })).not.toBeInTheDocument()
  })

  it('shows a filtered empty state (with a way to clear it) when filters match nothing', async () => {
    const user = userEvent.setup()
    mockShowtimesFor(filmA.id, [showtimeCinemaA])
    renderFilmDetail()
    await screen.findByRole('heading', { name: filmA.title })
    await screen.findByTestId(`cinema-group-${cinemaA.id}`)

    await user.selectOptions(screen.getByLabelText(/cinema/i), cinemaB.id)

    expect(await screen.findByText(/no showtimes match your filters/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /clear filters/i }))
    expect(await screen.findByTestId(`cinema-group-${cinemaA.id}`)).toBeInTheDocument()
  })

  it('renders an error state, with a working link back to films, when the film cannot be found', async () => {
    const user = userEvent.setup()
    renderFilmDetailWithShowtimeRoute('missing-film')

    expect(await screen.findByText(/film not found/i)).toBeInTheDocument()
    expect(screen.getByText(/this film could not be found/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /browse films/i }))
    expect(await screen.findByTestId('landed-films')).toBeInTheDocument()
  })

  it('clears the cinema filter (deleting the URL param) when "All cinemas" is reselected', async () => {
    const user = userEvent.setup()
    mockShowtimesFor(filmA.id, [showtimeCinemaA, showtimeCinemaB])
    renderFilmDetail()
    await screen.findByRole('heading', { name: filmA.title })
    await screen.findByTestId(`cinema-group-${cinemaB.id}`)

    await user.selectOptions(screen.getByLabelText(/cinema/i), cinemaA.id)
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(`cinema=${cinemaA.id}`))

    await user.selectOptions(screen.getByLabelText(/cinema/i), '')
    await waitFor(() => expect(screen.getByTestId('location')).not.toHaveTextContent('cinema='))
    expect(await screen.findByTestId(`cinema-group-${cinemaB.id}`)).toBeInTheDocument()
  })
})
