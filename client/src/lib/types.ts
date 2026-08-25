// The client-side API contract for the cinema domain (Film/Cinema/Showtime/
// Hold/Booking) — audited directly against the running server's models,
// serializers, controllers, services, and sockets (server/src/**), not
// against the SRS in isolation, since a few deliberate deviations exist
// (see the inline notes below, e.g. GET /api/showtimes/:id's sibling-key
// shape and the Hold read-endpoints' field names).
export type Role = 'customer' | 'admin'

// Describes a Showtime seat (not an Event seat). `effectiveSeatStatus`
// (server/src/serializers/showtimeSerializer.js) guarantees every seat the
// client ever sees already has this LIVE derived value baked in — there is
// no separate "raw" vs "effective" status exposed over the wire, ever.
export type SeatStatus = 'available' | 'held' | 'booked'

// Mirrors server/src/config/seatTiers.js `SEAT_TIERS` exactly.
export type SeatTier = 'STANDARD' | 'PREMIUM' | 'RECLINER'

export type ShowtimeStatus = 'scheduled' | 'cancelled'

// Narrowed vs the old Event/Booking domain — no more pending/expired
// (server/src/models/Booking.js's `status` enum is just these two).
export type BookingStatus = 'confirmed' | 'cancelled'

export type HoldStatus = 'active' | 'released' | 'consumed'

export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded'

// Mirrors server/src/models/Film.js's `certificate` enum exactly.
export type FilmCertificate = 'U' | 'PG' | '12A' | '15' | '18'

export interface User {
  id: string
  name: string
  email: string
  phone: string
  role: Role
  // NOTE: server/src/models/User.js has this field, and
  // server/src/middleware/verifiedGuard.js re-reads it fresh from the DB on
  // every gated request, but server/src/serializers/userSerializer.js's
  // `serializeUser` currently does NOT include it in any response body
  // (login/profile/etc). Until that serializer is updated, this will read
  // as `undefined` on every actual response — flagged here for whichever
  // later phase wires up profile/login, since gating booking actions on it
  // client-side needs the server fix first.
  emailVerified: boolean
  createdAt: string
}

// --- Catalogue: Film / Cinema ---

export interface Film {
  id: string
  title: string
  synopsis: string
  certificate: FilmCertificate
  runtimeMinutes: number
  genre: string[]
  posterUrl?: string
  releaseDate: string
  createdAt?: string
}

// A cinema's screen seat layout — used by admin cinema management, not by
// the seat map itself (which uses `ShowtimeSeat`, generated from this at
// showtime-creation time).
export interface SeatLayoutItem {
  id: string
  section: string
  row: string
  number: number
}

export interface Screen {
  screenId: string
  name: string
  seatLayout: SeatLayoutItem[]
  capacity: number
}

// Full/admin shape — GET /api/cinemas/:id (cinemaSerializer.serializeCinema).
export interface Cinema {
  id: string
  name: string
  address: string
  city: string
  screens: Screen[]
}

// List-view shape — GET /api/cinemas (cinemaSerializer.serializeCinemaSummary).
// Deliberately has no `screens`/seat layouts on the wire.
export interface CinemaSummary {
  id: string
  name: string
  address: string
  city: string
  screenCount: number
  totalCapacity: number
}

// --- Showtime ---

// Compact, populate-tolerant refs embedded in a showtime listing
// (showtimeSerializer.serializeFilmRef/serializeCinemaRef). Only `id` is
// guaranteed — every other field is present only when the ref was populated.
export interface FilmRef {
  id: string
  title?: string
  posterUrl?: string
  certificate?: FilmCertificate
  runtimeMinutes?: number
}

export interface CinemaRef {
  id: string
  name?: string
  city?: string
}

// A showtime seat's `status` is ALWAYS the live-derived value the server
// computed via `effectiveSeatStatus` — never a raw stored value.
export interface ShowtimeSeat {
  id: string
  section: string
  row: string
  number: number
  tier: SeatTier
  price: number
  status: SeatStatus
}

export interface ShowtimeSummary {
  id: string
  film: FilmRef | null
  cinema: CinemaRef | null
  screenName: string
  startsAt: string
  basePrice: number
  status: ShowtimeStatus
  totalSeats: number
  availableSeats: number
}

// GET /api/showtimes/:id's ACTUAL response shape (showtimeController.getShowtime):
// `{showtime, seats}` as TWO SIBLING top-level keys — matching the legacy
// Event `{event, seats}` shape — NOT a single object with `seats` nested
// inside it. This is a deliberate, real API quirk; do not "fix" it into a
// merged ShowtimeDetail type.
export interface ShowtimeDetailResponse {
  showtime: ShowtimeSummary
  seats: ShowtimeSeat[]
}

// adminService.listAdminShowtimes — every showtime (incl. cancelled/past)
// plus revenue/bookingCount derived from confirmed bookings.
export type AdminShowtime = ShowtimeSummary & {
  revenue: number
  bookingCount: number
}

// --- Hold ---

// Hold.seatSnapshot's actual leaner shape (server/src/models/Hold.js) — no
// row/number/tier at the Hold level, only what's needed to freeze
// price/identity. Deliberately narrower than `BookedSeat` below.
export interface HoldSeatSnapshot {
  id: string
  section: string
  price: number
}

// POST /api/holds's actual response shape (holdController.createHold) —
// NOT the full Hold document.
export interface CreateHoldResponse {
  holdId: string
  expiresAt: string
  amountMinor: number
  currency: string
}

// GET /api/holds/:id's actual response shape (holdController.getHold).
// Field names are `holdId`/`showtimeId`, NOT `id`/`showtimeRef` — the
// controller builds this object by hand rather than reusing the Hold
// document's own field names.
export interface Hold {
  holdId: string
  showtimeId: string
  seatIds: string[]
  seatSnapshot: HoldSeatSnapshot[]
  totalPrice: number
  amountMinor: number
  currency: string
  status: HoldStatus
  expiresAt: string
  paymentIntentId: string | null
}

// POST /api/holds/:id/payment-intent's response shape
// (holdService.createPaymentIntentForHold).
export interface CreateHoldPaymentIntentResponse {
  clientSecret: string
  publishableKey: string | null
  expiresAt: string
  amount: number
}

// --- Booking ---

// Booking.seats' actual shape (server/src/models/Booking.js's
// `bookedSeatSchema`) — richer than `HoldSeatSnapshot`: confirmService
// re-fetches row/number from the live Showtime when fulfilling a Hold, so a
// Booking's seats DO carry row/number even though the Hold they came from
// didn't.
export interface BookedSeat {
  id: string
  section: string
  row: string
  number: number
  price: number
}

// Compact ref embedded in a Booking (bookingSerializer.serializePopulatedShowtime).
// Only present when `showtimeRef` was populated; null otherwise. Deliberately
// carries no Film/Cinema info — only what's on the Showtime document itself.
export interface ShowtimeRef {
  id: string
  screenName: string
  startsAt: string
}

export interface BookingUserRef {
  id: string
  name: string
  email: string
}

// bookingSerializer.serializeBooking's actual output, field for field.
export interface Booking {
  id: string
  reference: string
  userId: string | null
  user: BookingUserRef | null
  showtime: ShowtimeRef | null
  seats: BookedSeat[]
  totalPrice: number
  status: BookingStatus
  paymentIntentId: string | null
  paymentStatus: PaymentStatus | null
  createdAt: string
}

// --- Admin stats ---

// adminService.getStats()'s actual returned keys.
export interface AdminStats {
  totalShowtimes: number
  upcomingShowtimes: number
  totalBookings: number
  confirmedBookings: number
  cancelledBookings: number
  totalRevenue: number
  totalSeats: number
  bookedSeats: number
  availableSeats: number
  occupancyRate: number
}

// Shared pagination envelope used by every `list*` service
// (filmService.listFilms, showtimeService.listShowtimes,
// adminService.listAdminShowtimes, bookingService.getUserBookings/getAllBookings).
export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

// --- Request payloads ---

export interface RegisterPayload {
  name: string
  email: string
  password: string
  phone: string
}

// D14 — registration never issues a token/user, only a status message.
export interface RegisterResponse {
  message: string
}

export interface VerifyEmailPayload {
  token: string
}

export interface VerifyEmailResponse {
  verified: true
}

// Authenticated endpoint, no request body (authController.resendVerification
// reads only `req.user.id`).
export interface ResendVerificationResponse {
  message: string
}

export interface LoginPayload {
  email: string
  password: string
}

export interface LoginResponse {
  user: User
  token: string
}

export interface ForgotPasswordPayload {
  email: string
}

export interface ForgotPasswordResponse {
  message: string
}

// Body field is `password`, not `newPassword` — the server maps it to
// `newPassword` internally (authController.resetPassword); the client must
// send `password` to match the actual HTTP contract (resetPasswordSchema).
export interface ResetPasswordPayload {
  token: string
  password: string
}

export interface ResetPasswordResponse {
  message: string
}

export interface UpdateProfilePayload {
  name?: string
  email?: string
  phone?: string
}

export interface CreateFilmPayload {
  title: string
  synopsis: string
  certificate: FilmCertificate
  runtimeMinutes: number
  genre: string[]
  posterUrl?: string
  releaseDate: string
}

export type UpdateFilmPayload = Partial<CreateFilmPayload>

export interface CinemaScreenPayload {
  screenId: string
  name: string
  seatLayout: SeatLayoutItem[]
}

export interface CreateCinemaPayload {
  name: string
  address: string
  city: string
  screens: CinemaScreenPayload[]
}

export type UpdateCinemaPayload = Partial<CreateCinemaPayload>

export interface CreateShowtimePayload {
  filmRef: string
  cinemaRef: string
  screenId: string
  startsAt: string
  basePrice: number
}

export interface CreateHoldPayload {
  showtimeId: string
  seatIds: string[]
}

export interface ConfirmBookingPayload {
  holdId: string
}

// --- Error contract ---

// The codes the running server actually emits — audited via a full grep of
// every `new AppError(...)` call site across server/src (controllers,
// services, middleware, config), plus the built-in Mongoose/JWT-error
// mappings in `middleware/errorHandler.js`, plus a client-only NETWORK_ERROR
// for a request that never reached the server.
export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'TOKEN_EXPIRED'
  | 'INVALID_TOKEN'
  | 'TOKEN_REVOKED'
  | 'TOKEN_NOT_FOUND'
  | 'TOKEN_USED'
  | 'EMAIL_NOT_VERIFIED'
  | 'RATE_LIMITED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'USER_NOT_FOUND'
  | 'DUPLICATE_EMAIL'
  | 'INVALID_CREDENTIALS'
  | 'FILM_NOT_FOUND'
  | 'FILM_IN_USE'
  | 'CINEMA_NOT_FOUND'
  | 'CINEMA_IN_USE'
  | 'SCREEN_NOT_FOUND'
  | 'SHOWTIME_NOT_FOUND'
  | 'SHOWTIME_STARTED'
  | 'SHOWTIME_CANCELLED'
  | 'HOLD_NOT_FOUND'
  | 'HOLD_EXPIRED'
  | 'SEAT_UNAVAILABLE'
  | 'SEAT_NOT_FOUND'
  | 'PAYMENT_NOT_SUCCEEDED'
  | 'PAYMENT_PROVIDER_UNAVAILABLE'
  | 'ALLOCATION_FAILED'
  | 'BOOKING_NOT_FOUND'
  | 'BOOKING_NOT_CANCELLABLE'
  | 'MAIL_NOT_FOUND'
  | 'CAPACITY_EXCEEDED'
  | 'INVALID_FILTER'
  | 'INVALID_SEAT_TIER'
  | 'INVALID_IDENTIFIER'
  | 'DUPLICATE_RESOURCE'
  | 'INTERNAL_SERVER_ERROR'
  | 'NETWORK_ERROR' // client-synthesized: request never reached the server

export interface ApiError {
  code: ApiErrorCode
  message: string
  // HTTP status code, when the error came from a real response. Populated
  // by `parseApiError` from `err.response.status`. This is what the
  // response interceptor must key its logout-on-401 behaviour on, NOT
  // `code` — see client.ts for why (TOKEN_EXPIRED/INVALID_TOKEN are also
  // the codes for an expired/garbage verify-email or reset-password link,
  // which come back as 400, not 401).
  status?: number
  details?: unknown
}

// --- Socket.IO payloads (§C7.2) ---

export interface SeatsUpdatedPayload {
  showtimeId: string
  seatIds: string[]
  status: SeatStatus
}

export interface ShowtimeCancelledPayload {
  showtimeId: string
}

export interface BookingConfirmedPayload {
  holdId: string
  bookingId: string
  reference: string
}

export interface BookingUpdatedPayload {
  bookingId: string
  status: BookingStatus
  paymentStatus?: PaymentStatus
}

export interface ServerToClientEvents {
  'seats:updated': (payload: SeatsUpdatedPayload) => void
  'showtime:cancelled': (payload: ShowtimeCancelledPayload) => void
  'booking:confirmed': (payload: BookingConfirmedPayload) => void
  'booking:updated': (payload: BookingUpdatedPayload) => void
  error: (payload: { code: string; message: string }) => void
}

export interface ClientToServerEvents {
  'join:showtime': (payload: { showtimeId: string }) => void
  'leave:showtime': (payload: { showtimeId: string }) => void
}
