import { describe, it, expect, beforeAll, beforeEach, afterAll, jest } from '@jest/globals';
import mongoose from 'mongoose';
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import { createStripeMock, mockStripeModule } from '../helpers/mocks.js';

// Stripe must be mocked before the dynamic import of confirmService.js (and
// holdService.js, which it transitively needs for test fixtures) below.
const stripeMock = createStripeMock();
mockStripeModule(stripeMock);

// The socket gateway must also be mocked before the dynamic import, so a
// broadcast is observable rather than silently swallowed by the gateway's
// own try/catch (no real Socket.IO server exists in this test).
const socketMock = {
  broadcastShowtimeSeatsUpdated: jest.fn(),
  broadcastBookingConfirmed: jest.fn(),
  broadcastBookingUpdated: jest.fn(),
  broadcastSeatUpdate: jest.fn(),
};
jest.unstable_mockModule('../../src/sockets/seatSocketGateway.js', () => socketMock);

// Mock notifications so call counts are directly observable, matching the
// D4.3(b) idempotency assertions elsewhere.
const notificationMock = {
  notifyBookingConfirmed: jest.fn(),
  notifyBookingCancelled: jest.fn(),
  notifyPaymentFailed: jest.fn(),
  notifyEventCancelled: jest.fn(),
  notifyVerifyEmail: jest.fn(),
  notifyPasswordReset: jest.fn(),
};
jest.unstable_mockModule('../../src/services/notification/notificationService.js', () => notificationMock);

let confirmService;
let holdService;
let Hold;
let Booking;
let Showtime;
let User;
let Film;
let Cinema;

function showtimeSeat(overrides = {}) {
  return {
    id: 'A-1',
    section: 'STANDARD',
    row: 'A',
    number: 1,
    tier: 'STANDARD',
    price: 1000,
    status: 'available',
    ...overrides,
  };
}

async function createFilmAndCinema() {
  const film = await Film.create({
    title: 'Test Feature Film',
    synopsis: 'A synopsis.',
    certificate: 'PG',
    runtimeMinutes: 120,
    genre: ['Drama'],
    releaseDate: new Date(Date.now() - 86400000),
  });
  const cinema = await Cinema.create({
    name: 'Test Cinema',
    address: '1 Test Ave',
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

async function createShowtime({ film, cinema, seats } = {}) {
  return Showtime.create({
    filmRef: film._id,
    cinemaRef: cinema._id,
    screenId: '1',
    screenName: 'Screen 1',
    startsAt: new Date(Date.now() + 86400000),
    basePrice: 1000,
    status: 'scheduled',
    seats: seats || [showtimeSeat()],
  });
}

async function createUser(overrides = {}) {
  return User.create({
    name: 'Test Customer',
    email: `customer${Math.random().toString(36).slice(2)}@test.com`,
    passwordHash: 'hash',
    phone: `9477${Math.floor(1000000 + Math.random() * 8999999)}`,
    role: 'customer',
    emailVerified: true,
    ...overrides,
  });
}

/**
 * Build a full active, paid Hold: Film + Cinema + Showtime (one seat) +
 * User + Hold (via the real holdService.createHold, so the seat's
 * `held`/`holdRef`/`holdExpiresAt` linkage is exactly as production code
 * produces it), with a `paymentIntentId` already attached.
 */
async function createPaidHold({ paymentIntentId = 'pi_test_confirm' } = {}) {
  const { film, cinema } = await createFilmAndCinema();
  const showtime = await createShowtime({ film, cinema });
  const user = await createUser();

  const hold = await holdService.createHold({
    userId: user._id.toString(),
    showtimeId: showtime._id.toString(),
    seatIds: ['A-1'],
  });

  await Hold.updateOne({ _id: hold._id }, { $set: { paymentIntentId } });
  const paidHold = await Hold.findById(hold._id);

  return { hold: paidHold, showtime, user, film, cinema };
}

function succeededIntentFor(hold, overrides = {}) {
  return {
    id: hold.paymentIntentId,
    status: 'succeeded',
    amount: hold.amountMinor,
    currency: hold.currency.toLowerCase(),
    metadata: { holdId: hold._id.toString() },
    ...overrides,
  };
}

describe('services/confirmService.js (ADR-014, §C7.1, §D4.3)', () => {
  beforeAll(async () => {
    await connectTestDB();
    confirmService = await import('../../src/services/confirmService.js');
    holdService = await import('../../src/services/holdService.js');
    Hold = (await import('../../src/models/Hold.js')).default;
    Booking = (await import('../../src/models/Booking.js')).default;
    Showtime = (await import('../../src/models/Showtime.js')).default;
    User = (await import('../../src/models/User.js')).default;
    Film = (await import('../../src/models/Film.js')).default;
    Cinema = (await import('../../src/models/Cinema.js')).default;
  });

  afterAll(async () => {
    await closeTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
    jest.clearAllMocks();
  });

  describe('confirmBooking — happy path', () => {
    it('creates exactly one Booking with the right fields and marks the hold consumed', async () => {
      const { hold, user, showtime } = await createPaidHold();
      stripeMock.paymentIntents.retrieve.mockResolvedValueOnce(succeededIntentFor(hold));

      const booking = await confirmService.confirmBooking({
        holdId: hold._id.toString(),
        userId: user._id.toString(),
      });

      expect(booking.status).toBe('confirmed');
      expect(booking.paymentStatus).toBe('succeeded');
      expect(booking.paymentIntentId).toBe(hold.paymentIntentId);
      expect(booking.holdRef.toString()).toBe(hold._id.toString());
      expect(booking.showtimeRef.toString()).toBe(showtime._id.toString());
      expect(booking.totalPrice).toBe(hold.totalPrice);
      expect(booking.seats).toHaveLength(1);
      expect(booking.seats[0]).toMatchObject({ id: 'A-1', section: 'STANDARD', row: 'A', number: 1, price: 1000 });
      expect(booking.reference).toMatch(/^ENC-/);

      const bookingCount = await Booking.countDocuments({});
      expect(bookingCount).toBe(1);

      const updatedHold = await Hold.findById(hold._id);
      expect(updatedHold.status).toBe('consumed');

      const updatedShowtime = await Showtime.findById(showtime._id);
      expect(updatedShowtime.seats[0].status).toBe('booked');
      expect(updatedShowtime.seats[0].holdRef).toBeUndefined();

      expect(socketMock.broadcastShowtimeSeatsUpdated).toHaveBeenCalledWith(showtime._id.toString(), ['A-1'], 'booked');
      expect(socketMock.broadcastBookingConfirmed).toHaveBeenCalledWith(user._id.toString(), {
        holdId: hold._id.toString(),
        bookingId: booking._id.toString(),
        reference: booking.reference,
      });
      expect(notificationMock.notifyBookingConfirmed).toHaveBeenCalledTimes(1);
    });
  });

  describe('confirmBooking — verification mismatches (generic outcome, no information leakage)', () => {
    it('rejects an amount mismatch with the generic PAYMENT_NOT_SUCCEEDED error', async () => {
      const { hold, user } = await createPaidHold();
      stripeMock.paymentIntents.retrieve.mockResolvedValueOnce(
        succeededIntentFor(hold, { amount: hold.amountMinor + 1 })
      );

      await expect(
        confirmService.confirmBooking({ holdId: hold._id.toString(), userId: user._id.toString() })
      ).rejects.toMatchObject({
        statusCode: 402,
        code: 'PAYMENT_NOT_SUCCEEDED',
        message: 'Unable to confirm this booking. Please contact support if you believe this is an error.',
      });

      expect(await Booking.countDocuments({})).toBe(0);
    });

    it('rejects a currency mismatch with the SAME generic error', async () => {
      const { hold, user } = await createPaidHold();
      stripeMock.paymentIntents.retrieve.mockResolvedValueOnce(succeededIntentFor(hold, { currency: 'usd' }));

      await expect(
        confirmService.confirmBooking({ holdId: hold._id.toString(), userId: user._id.toString() })
      ).rejects.toMatchObject({
        statusCode: 402,
        code: 'PAYMENT_NOT_SUCCEEDED',
        message: 'Unable to confirm this booking. Please contact support if you believe this is an error.',
      });

      expect(await Booking.countDocuments({})).toBe(0);
    });

    it('rejects a metadata.holdId mismatch with the SAME generic error', async () => {
      const { hold, user } = await createPaidHold();
      stripeMock.paymentIntents.retrieve.mockResolvedValueOnce(
        succeededIntentFor(hold, { metadata: { holdId: new mongoose.Types.ObjectId().toString() } })
      );

      await expect(
        confirmService.confirmBooking({ holdId: hold._id.toString(), userId: user._id.toString() })
      ).rejects.toMatchObject({
        statusCode: 402,
        code: 'PAYMENT_NOT_SUCCEEDED',
        message: 'Unable to confirm this booking. Please contact support if you believe this is an error.',
      });

      expect(await Booking.countDocuments({})).toBe(0);
    });

    it('rejects a non-succeeded intent status with the SAME generic error', async () => {
      const { hold, user } = await createPaidHold();
      stripeMock.paymentIntents.retrieve.mockResolvedValueOnce(
        succeededIntentFor(hold, { status: 'requires_payment_method' })
      );

      await expect(
        confirmService.confirmBooking({ holdId: hold._id.toString(), userId: user._id.toString() })
      ).rejects.toMatchObject({
        statusCode: 402,
        code: 'PAYMENT_NOT_SUCCEEDED',
        message: 'Unable to confirm this booking. Please contact support if you believe this is an error.',
      });

      expect(await Booking.countDocuments({})).toBe(0);
    });
  });

  describe('confirmBooking — Stripe unreachable', () => {
    it('rejects with 503 PAYMENT_PROVIDER_UNAVAILABLE, distinct from a verification mismatch, and retains the hold', async () => {
      const { hold, user } = await createPaidHold();
      stripeMock.paymentIntents.retrieve.mockRejectedValueOnce(new Error('network error'));

      await expect(
        confirmService.confirmBooking({ holdId: hold._id.toString(), userId: user._id.toString() })
      ).rejects.toMatchObject({ statusCode: 503, code: 'PAYMENT_PROVIDER_UNAVAILABLE' });

      const stillActive = await Hold.findById(hold._id);
      expect(stillActive.status).toBe('active');
      expect(await Booking.countDocuments({})).toBe(0);
    });
  });

  describe('confirmBooking — idempotency (D4.3(b)(i))', () => {
    it('returns the existing booking on an already-consumed hold, without re-verifying payment or creating a second booking', async () => {
      const { hold, user } = await createPaidHold();
      stripeMock.paymentIntents.retrieve.mockResolvedValueOnce(succeededIntentFor(hold));

      const first = await confirmService.confirmBooking({
        holdId: hold._id.toString(),
        userId: user._id.toString(),
      });

      jest.clearAllMocks();

      const second = await confirmService.confirmBooking({
        holdId: hold._id.toString(),
        userId: user._id.toString(),
      });

      expect(second._id.toString()).toBe(first._id.toString());
      expect(second.reference).toBe(first.reference);
      expect(await Booking.countDocuments({})).toBe(1);
      expect(stripeMock.paymentIntents.retrieve).not.toHaveBeenCalled();
      expect(notificationMock.notifyBookingConfirmed).not.toHaveBeenCalled();
    });
  });

  describe('confirmBooking — ownership, missing hold, no payment initiated, released hold', () => {
    it('throws 404 HOLD_NOT_FOUND for a bogus hold id', async () => {
      await expect(
        confirmService.confirmBooking({
          holdId: new mongoose.Types.ObjectId().toString(),
          userId: new mongoose.Types.ObjectId().toString(),
        })
      ).rejects.toMatchObject({ statusCode: 404, code: 'HOLD_NOT_FOUND' });
    });

    it('throws 403 FORBIDDEN for a non-owner', async () => {
      const { hold } = await createPaidHold();
      await expect(
        confirmService.confirmBooking({
          holdId: hold._id.toString(),
          userId: new mongoose.Types.ObjectId().toString(),
        })
      ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    });

    it('throws 400 VALIDATION_ERROR when no payment has been initiated', async () => {
      const { film, cinema } = await createFilmAndCinema();
      const showtime = await createShowtime({ film, cinema });
      const user = await createUser();
      const hold = await holdService.createHold({
        userId: user._id.toString(),
        showtimeId: showtime._id.toString(),
        seatIds: ['A-1'],
      });

      await expect(
        confirmService.confirmBooking({ holdId: hold._id.toString(), userId: user._id.toString() })
      ).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    });

    it('throws 409 HOLD_EXPIRED for a released hold', async () => {
      const { hold, user } = await createPaidHold();
      await Hold.updateOne({ _id: hold._id }, { $set: { status: 'released' } });

      await expect(
        confirmService.confirmBooking({ holdId: hold._id.toString(), userId: user._id.toString() })
      ).rejects.toMatchObject({ statusCode: 409, code: 'HOLD_EXPIRED' });
    });
  });

  describe('confirmBooking — FR-40 allocation failure', () => {
    it('auto-refunds, releases the hold, and rejects with 409 ALLOCATION_FAILED when seats can no longer be allocated', async () => {
      const { hold, user, showtime } = await createPaidHold();
      stripeMock.paymentIntents.retrieve.mockResolvedValueOnce(succeededIntentFor(hold));

      // Pre-corrupt the showtime's seat state: some other process already
      // touched the seat this hold was supposedly holding.
      await Showtime.updateOne(
        { _id: showtime._id },
        { $set: { 'seats.$[elem].status': 'available' }, $unset: { 'seats.$[elem].holdRef': '' } },
        { arrayFilters: [{ 'elem.id': 'A-1' }] }
      );

      await expect(
        confirmService.confirmBooking({ holdId: hold._id.toString(), userId: user._id.toString() })
      ).rejects.toMatchObject({ statusCode: 409, code: 'ALLOCATION_FAILED' });

      expect(stripeMock.refunds.create).toHaveBeenCalledWith({ payment_intent: hold.paymentIntentId });

      const updatedHold = await Hold.findById(hold._id);
      expect(updatedHold.status).toBe('released');

      expect(await Booking.countDocuments({})).toBe(0);
    });
  });
});
