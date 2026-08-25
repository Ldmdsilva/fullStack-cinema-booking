// Shared sample data for tests — shapes copied directly from src/lib/types.ts
// rather than invented, per the client API contract.
import type {
  AdminShowtime,
  AdminStats,
  Booking,
  Cinema,
  CinemaSummary,
  CreateHoldPaymentIntentResponse,
  CreateHoldResponse,
  Film,
  Hold,
  ShowtimeDetailResponse,
  ShowtimeSeat,
  ShowtimeSummary,
  User,
} from '@/lib/types'

export const customerUser: User = {
  id: 'user-1',
  name: 'Alex Rivera',
  email: 'alex@example.com',
  phone: '0771234567',
  role: 'customer',
  emailVerified: true,
  createdAt: '2026-01-01T00:00:00.000Z',
}

export const adminUser: User = {
  id: 'user-admin',
  name: 'Jordan Blake',
  email: 'jordan@example.com',
  phone: '0777654321',
  role: 'admin',
  emailVerified: true,
  createdAt: '2026-01-01T00:00:00.000Z',
}

export const unverifiedUser: User = {
  id: 'user-2',
  name: 'Riley Chen',
  email: 'riley@example.com',
  phone: '0779876543',
  role: 'customer',
  emailVerified: false,
  createdAt: '2026-01-01T00:00:00.000Z',
}

export const filmA: Film = {
  id: 'film-1',
  title: 'The Marfa Sessions',
  synopsis: 'An intimate acoustic evening captured on film.',
  certificate: '12A',
  runtimeMinutes: 108,
  genre: ['Drama', 'Music'],
  posterUrl: 'https://images.example.com/marfa.jpg',
  releaseDate: '2026-09-12T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
}

export const filmB: Film = {
  id: 'film-2',
  title: 'Night Choir',
  synopsis: 'A choral mystery set in a hollow valley.',
  certificate: 'PG',
  runtimeMinutes: 96,
  genre: ['Mystery'],
  releaseDate: '2026-10-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
}

export const cinemaA: Cinema = {
  id: 'cinema-1',
  name: 'The Half Moon',
  address: '123 Galle Road, Colombo 03',
  city: 'Colombo',
  screens: [
    {
      screenId: 'screen-1',
      name: 'Screen 1',
      capacity: 4,
      seatLayout: [
        { id: 'A-1', section: 'STANDARD', row: 'A', number: 1 },
        { id: 'A-2', section: 'STANDARD', row: 'A', number: 2 },
        { id: 'A-3', section: 'PREMIUM', row: 'A', number: 3 },
        { id: 'A-4', section: 'PREMIUM', row: 'A', number: 4 },
      ],
    },
  ],
}

export const cinemaB: Cinema = {
  id: 'cinema-2',
  name: 'Marfa Hall',
  address: '9 Marine Drive',
  city: 'Galle',
  screens: [
    {
      screenId: 'screen-1',
      name: 'Screen 1',
      capacity: 1,
      seatLayout: [{ id: 'A-1', section: 'STANDARD', row: 'A', number: 1 }],
    },
  ],
}

export const cinemaSummaryA: CinemaSummary = {
  id: cinemaA.id,
  name: cinemaA.name,
  address: cinemaA.address,
  city: cinemaA.city,
  screenCount: cinemaA.screens.length,
  totalCapacity: cinemaA.screens.reduce((sum, s) => sum + s.capacity, 0),
}

export const cinemaSummaryB: CinemaSummary = {
  id: cinemaB.id,
  name: cinemaB.name,
  address: cinemaB.address,
  city: cinemaB.city,
  screenCount: cinemaB.screens.length,
  totalCapacity: cinemaB.screens.reduce((sum, s) => sum + s.capacity, 0),
}

function makeShowtimeSeats(): ShowtimeSeat[] {
  return [
    { id: 'A-1', section: 'STANDARD', row: 'A', number: 1, tier: 'STANDARD', price: 1500, status: 'available' },
    { id: 'A-2', section: 'STANDARD', row: 'A', number: 2, tier: 'STANDARD', price: 1500, status: 'available' },
    { id: 'A-3', section: 'PREMIUM', row: 'A', number: 3, tier: 'PREMIUM', price: 2000, status: 'held' },
    { id: 'A-4', section: 'PREMIUM', row: 'A', number: 4, tier: 'PREMIUM', price: 2000, status: 'booked' },
  ]
}

export const showtimeSeats: ShowtimeSeat[] = makeShowtimeSeats()

export const showtimeSummaryA: ShowtimeSummary = {
  id: 'showtime-1',
  film: { id: filmA.id, title: filmA.title, posterUrl: filmA.posterUrl, certificate: filmA.certificate, runtimeMinutes: filmA.runtimeMinutes },
  cinema: { id: cinemaA.id, name: cinemaA.name, city: cinemaA.city },
  screenName: 'Screen 1',
  startsAt: '2026-09-12T20:00:00.000Z',
  basePrice: 1500,
  status: 'scheduled',
  totalSeats: 4,
  availableSeats: 2,
}

export const showtimeSummaryB: ShowtimeSummary = {
  id: 'showtime-2',
  film: { id: filmB.id, title: filmB.title },
  cinema: { id: cinemaB.id, name: cinemaB.name, city: cinemaB.city },
  screenName: 'Screen 1',
  startsAt: '2026-10-01T19:00:00.000Z',
  basePrice: 1200,
  status: 'scheduled',
  totalSeats: 1,
  availableSeats: 0,
}

export const showtimeDetailA: ShowtimeDetailResponse = {
  showtime: showtimeSummaryA,
  seats: showtimeSeats,
}

export const adminShowtimeA: AdminShowtime = {
  ...showtimeSummaryA,
  revenue: 45500,
  bookingCount: 7,
}

export const adminShowtimeB: AdminShowtime = {
  ...showtimeSummaryB,
  revenue: 0,
  bookingCount: 0,
}

export const createHoldResponseA: CreateHoldResponse = {
  holdId: 'hold-1',
  expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  amountMinor: 350000,
  currency: 'lkr',
}

export const holdA: Hold = {
  holdId: 'hold-1',
  showtimeId: showtimeSummaryA.id,
  seatIds: ['A-1', 'A-2'],
  seatSnapshot: [
    { id: 'A-1', section: 'STANDARD', price: 1500 },
    { id: 'A-2', section: 'STANDARD', price: 1500 },
  ],
  totalPrice: 3000,
  amountMinor: 300000,
  currency: 'lkr',
  status: 'active',
  expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  paymentIntentId: null,
}

export const createHoldPaymentIntentResponseA: CreateHoldPaymentIntentResponse = {
  clientSecret: 'pi_test_secret',
  publishableKey: 'pk_test_x',
  expiresAt: holdA.expiresAt,
  amount: holdA.amountMinor,
}

export const bookingConfirmed: Booking = {
  id: 'booking-1',
  reference: 'ENC-4471',
  userId: customerUser.id,
  user: { id: customerUser.id, name: customerUser.name, email: customerUser.email },
  showtime: { id: showtimeSummaryA.id, screenName: showtimeSummaryA.screenName, startsAt: showtimeSummaryA.startsAt },
  seats: [{ id: 'A-1', section: 'STANDARD', row: 'A', number: 1, price: 1500 }],
  totalPrice: 1500,
  status: 'confirmed',
  paymentIntentId: 'pi_test_123',
  paymentStatus: 'succeeded',
  createdAt: '2026-08-01T00:00:00.000Z',
}

export const bookingCancelled: Booking = {
  ...bookingConfirmed,
  id: 'booking-2',
  reference: 'ENC-9001',
  status: 'cancelled',
  paymentStatus: 'succeeded',
}

// A cancelled booking whose payment was actually refunded — distinct from
// `bookingCancelled` above, which models a cancellation that hasn't (yet)
// been refunded, so tests can tell the two badge states apart.
export const bookingRefunded: Booking = {
  ...bookingConfirmed,
  id: 'booking-3',
  reference: 'ENC-9002',
  status: 'cancelled',
  paymentStatus: 'refunded',
}

export const adminStats: AdminStats = {
  totalShowtimes: 2,
  upcomingShowtimes: 2,
  totalBookings: 10,
  confirmedBookings: 7,
  cancelledBookings: 3,
  totalRevenue: 45500,
  totalSeats: 20,
  bookedSeats: 14,
  availableSeats: 6,
  occupancyRate: 70,
}
