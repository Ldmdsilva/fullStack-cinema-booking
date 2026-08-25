import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import { createStripeMock, mockStripeModule } from '../helpers/mocks.js';
import { setIO } from '../../src/config/socket.js';
import User from '../../src/models/User.js';
import Film from '../../src/models/Film.js';
import Cinema from '../../src/models/Cinema.js';
import Showtime from '../../src/models/Showtime.js';
import Booking from '../../src/models/Booking.js';
import Hold from '../../src/models/Hold.js';

// Stripe must be mocked before the dynamic import of app.js below — the
// hold/payment-intent/confirm endpoints all go through the real (mocked)
// Stripe client.
const stripeMock = createStripeMock();
mockStripeModule(stripeMock);

let app;

function createFakeIO() {
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit }));
  return { to, emit };
}

async function createFilmAndCinema() {
  const film = await Film.create({
    title: 'Idempotency Test Film',
    synopsis: 'A synopsis.',
    certificate: 'PG',
    runtimeMinutes: 110,
    genre: ['Drama'],
    releaseDate: new Date(Date.now() - 86400000),
  });
  const cinema = await Cinema.create({
    name: 'Idempotency Test Cinema',
    address: '1 Idempotency Ave',
    city: 'Colombo',
    screens: [
      {
        screenId: '1',
        name: 'Screen 1',
        seatLayout: [{ id: 'A-1', section: 'STANDARD', row: 'A', number: 1 }],
      },
    ],
  });
  return { film, cinema };
}

async function createShowtime(film, cinema) {
  return Showtime.create({
    filmRef: film._id,
    cinemaRef: cinema._id,
    screenId: '1',
    screenName: 'Screen 1',
    startsAt: new Date(Date.now() + 86400000),
    basePrice: 1000,
    status: 'scheduled',
    seats: [
      {
        id: 'A-1',
        section: 'STANDARD',
        row: 'A',
        number: 1,
        tier: 'STANDARD',
        price: 1000,
        status: 'available',
      },
    ],
  });
}

async function createUserAndLogin() {
  const password = 'Password123!';
  const passwordHash = await bcrypt.hash(password, 10);
  const email = `confirm-idem-${Math.random().toString(36).slice(2)}@test.com`;
  const user = await User.create({
    name: 'Confirm Idempotency User',
    email,
    passwordHash,
    phone: `9477${Math.floor(1000000 + Math.random() * 8999999)}`,
    role: 'customer',
    emailVerified: true,
  });
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return { user, token: res.body.token };
}

describe('POST /api/bookings/confirm — idempotency (§D4.3(b)(i), ADR-014)', () => {
  beforeAll(async () => {
    await connectTestDB();
    app = (await import('../../src/app.js')).default;
  });

  afterAll(async () => {
    await closeTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
    jest.clearAllMocks();
  });

  it('calling confirm three times for the same hold creates exactly one Booking, dispatches exactly one booking:confirmed broadcast, and returns 200 with the same booking each time', async () => {
    const fakeIO = createFakeIO();
    setIO(fakeIO);

    const { film, cinema } = await createFilmAndCinema();
    const showtime = await createShowtime(film, cinema);
    const { token } = await createUserAndLogin();

    const holdRes = await request(app)
      .post('/api/holds')
      .set('Authorization', `Bearer ${token}`)
      .send({ showtimeId: showtime._id.toString(), seatIds: ['A-1'] });
    expect(holdRes.status).toBe(201);
    const holdId = holdRes.body.holdId;

    const intentRes = await request(app)
      .post(`/api/holds/${holdId}/payment-intent`)
      .set('Authorization', `Bearer ${token}`);
    expect(intentRes.status).toBe(201);

    const storedHold = await Hold.findById(holdId);
    const paymentIntentId = storedHold.paymentIntentId;
    expect(paymentIntentId).toBeDefined();

    // Mock Stripe reporting this exact PaymentIntent as succeeded, matching
    // amount/currency/metadata — persists across all three confirm calls
    // (only the first should actually reach Stripe; see the assertion below).
    stripeMock.paymentIntents.retrieve.mockImplementation(async (id) => ({
      id,
      status: 'succeeded',
      amount: storedHold.amountMinor,
      currency: storedHold.currency.toLowerCase(),
      metadata: { holdId: storedHold._id.toString() },
    }));

    const first = await request(app)
      .post('/api/bookings/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({ holdId });
    const second = await request(app)
      .post('/api/bookings/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({ holdId });
    const third = await request(app)
      .post('/api/bookings/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({ holdId });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(200);

    expect(second.body.booking.id).toBe(first.body.booking.id);
    expect(second.body.booking.reference).toBe(first.body.booking.reference);
    expect(third.body.booking.id).toBe(first.body.booking.id);
    expect(third.body.booking.reference).toBe(first.body.booking.reference);

    const bookingCount = await Booking.countDocuments({});
    expect(bookingCount).toBe(1);

    // Exactly one confirmation dispatch — not three (D4.3(b)(i)).
    const confirmedEmits = fakeIO.emit.mock.calls.filter(([eventName]) => eventName === 'booking:confirmed');
    expect(confirmedEmits).toHaveLength(1);

    // Only the first call should have actually retrieved the PaymentIntent
    // from Stripe — calls 2 and 3 short-circuit on the already-consumed hold.
    expect(stripeMock.paymentIntents.retrieve).toHaveBeenCalledTimes(1);
  });

  it('an unexpected field in the confirm body (e.g. amount) is rejected with 400 VALIDATION_ERROR, not silently ignored', async () => {
    const { film, cinema } = await createFilmAndCinema();
    const showtime = await createShowtime(film, cinema);
    const { token } = await createUserAndLogin();

    const holdRes = await request(app)
      .post('/api/holds')
      .set('Authorization', `Bearer ${token}`)
      .send({ showtimeId: showtime._id.toString(), seatIds: ['A-1'] });

    const res = await request(app)
      .post('/api/bookings/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({ holdId: holdRes.body.holdId, amount: 1 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('a forged confirm for another user\'s hold is rejected with 403', async () => {
    const { film, cinema } = await createFilmAndCinema();
    const showtime = await createShowtime(film, cinema);
    const { token: ownerToken } = await createUserAndLogin();

    const holdRes = await request(app)
      .post('/api/holds')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ showtimeId: showtime._id.toString(), seatIds: ['A-1'] });

    const { token: attackerToken } = await createUserAndLogin();
    const res = await request(app)
      .post('/api/bookings/confirm')
      .set('Authorization', `Bearer ${attackerToken}`)
      .send({ holdId: holdRes.body.holdId });

    expect(res.status).toBe(403);
  });
});
