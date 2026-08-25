import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { useParams } from 'react-router-dom'
import { ShowtimePage } from './ShowtimePage'
import { renderPage, renderRoutes } from '@/test/utils'
import { server } from '@/test/mocks/server'
import { getLastFakeSocket } from '@/test/mocks/socket'
import { showtimeSummaryA, createHoldResponseA } from '@/test/fixtures'
import { formatPrice, formatEventDate } from '@/lib/formatters'

const SHOWTIME_ID = showtimeSummaryA.id

function renderShowtime(id = SHOWTIME_ID, token = 'test-token') {
  return renderPage(<ShowtimePage />, '/showtimes/:id', { route: `/showtimes/${id}`, token })
}

// Stub landing pages so the page's various `navigate(...)` calls (continue →
// checkout, "Browse films", "Back to film") are all independently observable.
function CheckoutStub() {
  const { holdId } = useParams<{ holdId: string }>()
  return <div data-testid="landed-checkout">landed:{holdId}</div>
}

function FilmsStub() {
  return <div data-testid="landed-films">landed-films</div>
}

function FilmDetailStub() {
  const { id } = useParams<{ id: string }>()
  return <div data-testid="landed-film-detail">landed:{id}</div>
}

function renderShowtimeWithNavRoutes(id = SHOWTIME_ID, token = 'test-token') {
  return renderRoutes(
    [
      { path: '/showtimes/:id', element: <ShowtimePage /> },
      { path: '/checkout/:holdId', element: <CheckoutStub /> },
      { path: '/films', element: <FilmsStub /> },
      { path: '/films/:id', element: <FilmDetailStub /> },
    ],
    { route: `/showtimes/${id}`, token },
  )
}

async function selectFirstAvailableSeat(user: ReturnType<typeof userEvent.setup>) {
  const group = await screen.findByRole('group', { name: /seat selection map/i })
  const available = within(group)
    .getAllByRole('button')
    .find((btn) => /, available$/i.test(btn.getAttribute('aria-label') ?? ''))
  if (!available) throw new Error('fixture must contain an available seat')
  await user.click(available)
  return available
}

describe('ShowtimePage', () => {
  it('renders film/cinema/screen/time info and the seat map once loaded', async () => {
    renderShowtime()

    expect(await screen.findByRole('heading', { name: showtimeSummaryA.film!.title })).toBeInTheDocument()
    expect(screen.getByText(showtimeSummaryA.screenName)).toBeInTheDocument()
    expect(screen.getByText(new RegExp(showtimeSummaryA.cinema!.name!))).toBeInTheDocument()
    expect(screen.getByText(formatEventDate(showtimeSummaryA.startsAt))).toBeInTheDocument()
    expect(screen.getByRole('group', { name: /seat selection map/i })).toBeInTheDocument()

    // Tier price summary (also echoed as seat-map tier headings, hence >= 1).
    expect(screen.getAllByText('Standard').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Premium').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Recliner').length).toBeGreaterThan(0)
    expect(screen.getAllByText(formatPrice(1500)).length).toBeGreaterThan(0)
    expect(screen.getByText('Available')).toBeInTheDocument()
    expect(screen.getByText('Selected')).toBeInTheDocument()
    expect(screen.getByText('On hold')).toBeInTheDocument()
    expect(screen.getByText('Taken')).toBeInTheDocument()

    // Nothing selected yet.
    expect(screen.getByText(/tap an available seat to add it/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled()
  })

  it('selects seats, updates the running total, and creates a hold on continue', async () => {
    const user = userEvent.setup()
    let capturedBody: unknown = null
    server.use(
      http.post('/api/holds', async ({ request }) => {
        capturedBody = await request.json()
        return HttpResponse.json(createHoldResponseA, { status: 201 })
      }),
    )

    renderShowtimeWithNavRoutes()
    const seat = await selectFirstAvailableSeat(user)

    const seatId = seat.getAttribute('aria-label')!.match(/^Seat (\S+),/)![1]
    expect(screen.getByRole('button', { name: /remove seat/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /continue/i }))

    await waitFor(() => expect(capturedBody).toEqual({ showtimeId: SHOWTIME_ID, seatIds: [seatId] }))
    expect(await screen.findByTestId('landed-checkout')).toHaveTextContent(`landed:${createHoldResponseA.holdId}`)
  })

  it('removes a selected seat via the sidebar remove button, resetting the total', async () => {
    const user = userEvent.setup()
    renderShowtime()
    await selectFirstAvailableSeat(user)

    expect(screen.getByRole('button', { name: /continue/i })).not.toBeDisabled()
    await user.click(screen.getByRole('button', { name: /remove seat/i }))

    expect(screen.getByText(/tap an available seat to add it/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled()
  })

  it('shows a generic inline error for a hold-creation failure unrelated to seats or verification', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('/api/holds', () =>
        HttpResponse.json({ error: { code: 'INTERNAL_SERVER_ERROR', message: 'Something went wrong on our end.' } }, { status: 500 }),
      ),
    )

    renderShowtime()
    await selectFirstAvailableSeat(user)
    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong on our end/i)
    expect(screen.queryByRole('button', { name: /resend verification email/i })).not.toBeInTheDocument()
  })

  it('shows an inline error and resyncs the seat map on SEAT_UNAVAILABLE (409)', async () => {
    const user = userEvent.setup()
    let getByIdCalls = 0
    server.use(
      http.get('/api/showtimes/:id', ({ params }) => {
        getByIdCalls += 1
        return HttpResponse.json({
          showtime: { ...showtimeSummaryA, id: params.id },
          seats: [
            { id: 'A-1', section: 'STANDARD', row: 'A', number: 1, tier: 'STANDARD', price: 1500, status: 'available' },
          ],
        })
      }),
      http.post('/api/holds', () =>
        HttpResponse.json({ error: { code: 'SEAT_UNAVAILABLE', message: 'Those seats were just taken.' } }, { status: 409 }),
      ),
    )

    renderShowtime()
    await selectFirstAvailableSeat(user)
    expect(getByIdCalls).toBe(1)

    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/those seats were just taken/i)
    await waitFor(() => expect(getByIdCalls).toBe(2))
  })

  it('shows the verify-email prompt on EMAIL_NOT_VERIFIED (403) and lets the user resend', async () => {
    const user = userEvent.setup()
    let resendCalls = 0
    server.use(
      http.post('/api/holds', () =>
        HttpResponse.json(
          { error: { code: 'EMAIL_NOT_VERIFIED', message: 'Please verify your email address before continuing.' } },
          { status: 403 },
        ),
      ),
      http.post('/api/auth/resend-verification', () => {
        resendCalls += 1
        return HttpResponse.json({ message: 'Verification email sent.' }, { status: 202 })
      }),
    )

    renderShowtime()
    await selectFirstAvailableSeat(user)
    await user.click(screen.getByRole('button', { name: /continue/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/verify your email address/i)
    const resendButton = screen.getByRole('button', { name: /resend verification email/i })

    await user.click(resendButton)

    expect(await screen.findByRole('button', { name: /verification email sent/i })).toBeDisabled()
    expect(resendCalls).toBe(1)
  })

  it('shows a resend error if the resend-verification call fails', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('/api/holds', () =>
        HttpResponse.json({ error: { code: 'EMAIL_NOT_VERIFIED', message: 'Please verify.' } }, { status: 403 }),
      ),
      http.post('/api/auth/resend-verification', () =>
        HttpResponse.json({ error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed.' } }, { status: 500 }),
      ),
    )

    renderShowtime()
    await selectFirstAvailableSeat(user)
    await user.click(screen.getByRole('button', { name: /continue/i }))
    await user.click(await screen.findByRole('button', { name: /resend verification email/i }))

    expect(await screen.findByText(/could not resend the email/i)).toBeInTheDocument()
  })

  it('swaps to the cancelled-state UI when the showtime is cancelled over the socket, and links back to the film', async () => {
    const user = userEvent.setup()
    renderShowtimeWithNavRoutes()
    await screen.findByRole('group', { name: /seat selection map/i })

    const socket = getLastFakeSocket()
    socket.trigger('showtime:cancelled', { showtimeId: SHOWTIME_ID })

    expect(await screen.findByText(/this showtime was cancelled/i)).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: /seat selection map/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /back to film/i }))
    expect(await screen.findByTestId('landed-film-detail')).toHaveTextContent(`landed:${showtimeSummaryA.film!.id}`)
  })

  it('renders an error state with a link back to films when the showtime is not found', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/showtimes/:id', () =>
        HttpResponse.json({ error: { code: 'SHOWTIME_NOT_FOUND', message: 'This showtime could not be found.' } }, { status: 404 }),
      ),
    )

    renderShowtimeWithNavRoutes('missing-showtime')

    expect(await screen.findByText(/showtime not found/i)).toBeInTheDocument()
    expect(screen.getByText(/this showtime could not be found/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /browse films/i }))
    expect(await screen.findByTestId('landed-films')).toBeInTheDocument()
  })
})
