// MSW request handlers mirroring the running server's REST contract (as
// captured in src/lib/types.ts and the src/lib/api/*.ts modules) closely
// enough to drive the test suite. Individual tests override a handler for a
// single case (a 409 conflict, an expired hold, ...) via `server.use(...)`;
// `setupTests.ts` resets to these defaults after every test.
import { http, HttpResponse } from 'msw'
import type { AdminShowtime, AdminStats, Booking, Cinema, CinemaSummary, Film, ShowtimeSeat, ShowtimeSummary, User } from '@/lib/types'
import {
  adminShowtimeA,
  adminShowtimeB,
  adminStats,
  adminUser,
  bookingCancelled,
  bookingConfirmed,
  bookingRefunded,
  cinemaA,
  cinemaB,
  cinemaSummaryA,
  cinemaSummaryB,
  createHoldPaymentIntentResponseA,
  createHoldResponseA,
  customerUser,
  filmA,
  filmB,
  holdA,
  showtimeSeats,
  showtimeSummaryA,
  showtimeSummaryB,
  unverifiedUser,
} from '@/test/fixtures'

const API = '/api'

function errorBody(code: string, message: string, details?: unknown) {
  return { error: { code, message, details } }
}

function userForToken(authHeader: string | null): User | null {
  if (authHeader === 'Bearer test-token') return customerUser
  if (authHeader === 'Bearer admin-token') return adminUser
  if (authHeader === 'Bearer unverified-token') return unverifiedUser
  return null
}

const films: Film[] = [filmA, filmB]
const cinemas: Cinema[] = [cinemaA, cinemaB]
const cinemaSummaries: CinemaSummary[] = [cinemaSummaryA, cinemaSummaryB]
const showtimes: ShowtimeSummary[] = [showtimeSummaryA, showtimeSummaryB]
const showtimeSeatsById: Record<string, ShowtimeSeat[]> = {
  [showtimeSummaryA.id]: showtimeSeats,
  [showtimeSummaryB.id]: [],
}
const adminShowtimes: AdminShowtime[] = [adminShowtimeA, adminShowtimeB]
const bookings: Booking[] = [bookingConfirmed, bookingCancelled, bookingRefunded]

export const handlers = [
  // --- auth ---
  http.post(`${API}/auth/register`, async ({ request }) => {
    const body = (await request.json()) as { email?: string }
    if (body.email === 'taken@example.com') {
      return HttpResponse.json(errorBody('DUPLICATE_EMAIL', 'An account with this email already exists.'), {
        status: 409,
      })
    }
    return HttpResponse.json({ message: 'Registered. Please check your email to verify your account.' }, { status: 202 })
  }),

  http.post(`${API}/auth/verify-email`, async ({ request }) => {
    const body = (await request.json()) as { token?: string }
    if (body.token === 'stale') {
      return HttpResponse.json(errorBody('TOKEN_EXPIRED', 'This link has expired.'), { status: 400 })
    }
    if (body.token === 'not-found-token') {
      return HttpResponse.json(errorBody('TOKEN_NOT_FOUND', 'This verification link could not be found.'), {
        status: 400,
      })
    }
    if (body.token === 'used-token') {
      return HttpResponse.json(errorBody('TOKEN_USED', 'This verification link has already been used.'), {
        status: 400,
      })
    }
    return HttpResponse.json({ verified: true })
  }),

  http.post(`${API}/auth/resend-verification`, ({ request }) => {
    const user = userForToken(request.headers.get('authorization'))
    if (!user) return HttpResponse.json(errorBody('UNAUTHORIZED', 'Please sign in to continue.'), { status: 401 })
    return HttpResponse.json({ message: 'Verification email sent.' }, { status: 202 })
  }),

  http.post(`${API}/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { email?: string; password?: string }
    if (body.email === customerUser.email && body.password === 'Password123') {
      return HttpResponse.json({ user: customerUser, token: 'test-token' }, { status: 200 })
    }
    if (body.email === adminUser.email && body.password === 'Password123') {
      return HttpResponse.json({ user: adminUser, token: 'admin-token' }, { status: 200 })
    }
    return HttpResponse.json(errorBody('INVALID_CREDENTIALS', 'Incorrect email or password.'), { status: 401 })
  }),

  http.post(`${API}/auth/forgot-password`, () =>
    HttpResponse.json({ message: 'If that email exists, a reset link has been sent.' }, { status: 202 }),
  ),

  http.post(`${API}/auth/reset-password`, async ({ request }) => {
    const body = (await request.json()) as { token?: string }
    if (body.token === 'bad') {
      return HttpResponse.json(errorBody('INVALID_TOKEN', 'This link is invalid.'), { status: 400 })
    }
    if (body.token === 'not-found-token') {
      return HttpResponse.json(errorBody('TOKEN_NOT_FOUND', 'This reset link could not be found.'), { status: 400 })
    }
    if (body.token === 'used-token') {
      return HttpResponse.json(errorBody('TOKEN_USED', 'This reset link has already been used.'), { status: 400 })
    }
    return HttpResponse.json({ message: 'Password reset successfully.' })
  }),

  http.get(`${API}/users/me`, ({ request }) => {
    const user = userForToken(request.headers.get('authorization'))
    if (!user) return HttpResponse.json(errorBody('UNAUTHORIZED', 'Please sign in to continue.'), { status: 401 })
    return HttpResponse.json({ user })
  }),

  http.patch(`${API}/users/me`, async ({ request }) => {
    const user = userForToken(request.headers.get('authorization'))
    if (!user) return HttpResponse.json(errorBody('UNAUTHORIZED', 'Please sign in to continue.'), { status: 401 })
    const patch = (await request.json()) as Partial<User>
    return HttpResponse.json({ user: { ...user, ...patch } })
  }),

  http.delete(`${API}/users/me`, () => new HttpResponse(null, { status: 204 })),

  // --- films ---
  http.get(`${API}/films`, ({ request }) => {
    const url = new URL(request.url)
    const genre = url.searchParams.get('genre')
    const search = url.searchParams.get('search')
    const page = Number(url.searchParams.get('page') ?? '1')
    const limit = Number(url.searchParams.get('limit') ?? '20')

    let filtered = films
    if (genre) filtered = filtered.filter((f) => f.genre.includes(genre))
    if (search) filtered = filtered.filter((f) => f.title.toLowerCase().includes(search.toLowerCase()))

    const total = filtered.length
    const totalPages = Math.max(1, Math.ceil(total / limit))
    const start = (page - 1) * limit
    return HttpResponse.json({ items: filtered.slice(start, start + limit), total, page, limit, totalPages })
  }),

  http.get(`${API}/films/:id`, ({ params }) => {
    const film = films.find((f) => f.id === params.id)
    if (!film) return HttpResponse.json(errorBody('FILM_NOT_FOUND', 'This film could not be found.'), { status: 404 })
    return HttpResponse.json({ film })
  }),

  http.post(`${API}/films`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({ film: { ...filmA, id: 'film-new', ...body } }, { status: 201 })
  }),

  http.put(`${API}/films/:id`, async ({ request, params }) => {
    const body = (await request.json()) as Record<string, unknown>
    const existing = films.find((f) => f.id === params.id) ?? filmA
    return HttpResponse.json({ film: { ...existing, ...body } })
  }),

  http.delete(`${API}/films/:id`, ({ params }) => {
    if (params.id === 'film-in-use') {
      return HttpResponse.json(
        errorBody('FILM_IN_USE', 'This film has showtimes scheduled against it and cannot be deleted.'),
        { status: 409 },
      )
    }
    return new HttpResponse(null, { status: 204 })
  }),

  // --- cinemas ---
  http.get(`${API}/cinemas`, () => HttpResponse.json({ items: cinemaSummaries })),

  http.get(`${API}/cinemas/:id`, ({ params }) => {
    const cinema = cinemas.find((c) => c.id === params.id)
    if (!cinema) return HttpResponse.json(errorBody('CINEMA_NOT_FOUND', 'This cinema could not be found.'), { status: 404 })
    return HttpResponse.json({ cinema })
  }),

  http.post(`${API}/cinemas`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({ cinema: { ...cinemaA, id: 'cinema-new', ...body } }, { status: 201 })
  }),

  http.patch(`${API}/cinemas/:id`, async ({ request, params }) => {
    const body = (await request.json()) as Record<string, unknown>
    const existing = cinemas.find((c) => c.id === params.id) ?? cinemaA
    return HttpResponse.json({ cinema: { ...existing, ...body } })
  }),

  http.delete(`${API}/cinemas/:id`, ({ params }) => {
    if (params.id === 'cinema-in-use') {
      return HttpResponse.json(
        errorBody('CINEMA_IN_USE', 'This cinema has showtimes scheduled against it and cannot be deleted.'),
        { status: 409 },
      )
    }
    return new HttpResponse(null, { status: 204 })
  }),

  // --- showtimes ---
  http.get(`${API}/showtimes`, ({ request }) => {
    const url = new URL(request.url)
    const filmId = url.searchParams.get('filmId')
    const cinemaId = url.searchParams.get('cinemaId')
    const page = Number(url.searchParams.get('page') ?? '1')
    const limit = Number(url.searchParams.get('limit') ?? '20')

    let filtered = showtimes
    if (filmId) filtered = filtered.filter((s) => s.film?.id === filmId)
    if (cinemaId) filtered = filtered.filter((s) => s.cinema?.id === cinemaId)

    const total = filtered.length
    const totalPages = Math.max(1, Math.ceil(total / limit))
    const start = (page - 1) * limit
    return HttpResponse.json({ items: filtered.slice(start, start + limit), total, page, limit, totalPages })
  }),

  http.get(`${API}/showtimes/:id`, ({ params }) => {
    const showtime = showtimes.find((s) => s.id === params.id)
    if (!showtime) {
      return HttpResponse.json(errorBody('SHOWTIME_NOT_FOUND', 'This showtime could not be found.'), { status: 404 })
    }
    return HttpResponse.json({ showtime, seats: showtimeSeatsById[showtime.id] ?? [] })
  }),

  http.post(`${API}/showtimes`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({ showtime: { ...showtimeSummaryA, id: 'showtime-new', ...body } }, { status: 201 })
  }),

  http.patch(`${API}/showtimes/:id/cancel`, ({ params }) => {
    const existing = showtimes.find((s) => s.id === params.id) ?? showtimeSummaryA
    return HttpResponse.json({ showtime: { ...existing, status: 'cancelled' } })
  }),

  // --- holds ---
  http.post(`${API}/holds`, () => HttpResponse.json(createHoldResponseA, { status: 201 })),

  http.get(`${API}/holds/:id`, ({ params }) => {
    if (params.id === 'nope') {
      return HttpResponse.json(errorBody('HOLD_NOT_FOUND', 'This hold could not be found — it may have expired.'), {
        status: 404,
      })
    }
    return HttpResponse.json({ ...holdA, holdId: params.id as string })
  }),

  http.post(`${API}/holds/:id/payment-intent`, () => HttpResponse.json(createHoldPaymentIntentResponseA, { status: 201 })),

  http.delete(`${API}/holds/:id`, () => new HttpResponse(null, { status: 204 })),

  // --- bookings ---
  http.get(`${API}/bookings/me`, () =>
    HttpResponse.json({ items: bookings, total: bookings.length, page: 1, limit: 10, totalPages: 1 }),
  ),

  http.post(`${API}/bookings/confirm`, () => HttpResponse.json({ booking: bookingConfirmed })),

  http.get(`${API}/bookings/by-hold/:holdId`, ({ params }) => {
    if (params.holdId === 'hold-reconciling') {
      return HttpResponse.json(errorBody('BOOKING_NOT_FOUND', 'This booking could not be found.'), { status: 404 })
    }
    return HttpResponse.json({ booking: bookingConfirmed })
  }),

  http.get(`${API}/bookings/:id`, ({ params }) => {
    const booking = bookings.find((b) => b.id === params.id)
    if (!booking) {
      return HttpResponse.json(errorBody('BOOKING_NOT_FOUND', 'This booking could not be found.'), { status: 404 })
    }
    return HttpResponse.json({ booking })
  }),

  http.get(`${API}/bookings`, () =>
    HttpResponse.json({ items: bookings, total: bookings.length, page: 1, limit: 20, totalPages: 1 }),
  ),

  http.patch(`${API}/bookings/:id/cancel`, ({ params }) => {
    const booking = bookings.find((b) => b.id === params.id) ?? bookingConfirmed
    return HttpResponse.json({ booking: { ...booking, status: 'cancelled' } })
  }),

  // --- admin ---
  http.get(`${API}/admin/stats`, () => HttpResponse.json(adminStats satisfies AdminStats)),

  http.get(`${API}/admin/showtimes`, () =>
    HttpResponse.json({ items: adminShowtimes, total: adminShowtimes.length, page: 1, limit: 20, totalPages: 1 }),
  ),

  // --- dev ---
  http.get(`${API}/dev/last-mail`, ({ request }) => {
    const url = new URL(request.url)
    const email = url.searchParams.get('email')
    if (!email) return HttpResponse.json(errorBody('VALIDATION_ERROR', 'email query parameter is required'), { status: 400 })
    if (email === 'unknown@example.com') {
      return HttpResponse.json(errorBody('MAIL_NOT_FOUND', 'No email found for that address'), { status: 404 })
    }
    return HttpResponse.json({
      to: email,
      subject: 'Verify your email',
      html: '<p>Click <a href="https://example.com/verify?token=abc">here</a> to verify.</p>',
      text: 'Click https://example.com/verify?token=abc to verify.',
      sentAt: '2026-08-01T00:00:00.000Z',
    })
  }),

  // --- health ---
  http.get(`${API}/health`, () =>
    HttpResponse.json({ status: 'healthy', db: 'connected', uptime: 123, timestamp: new Date().toISOString() }),
  ),
]
