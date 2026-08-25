import { describe, it, expect, beforeAll, beforeEach, afterAll, jest } from '@jest/globals';
import mongoose from 'mongoose';
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import { createStripeMock, mockStripeModule } from '../helpers/mocks.js';

// Stripe must be mocked before the dynamic import of confirmService.js (and
// holdService.js, which the fixtures below need) below.
const stripeMock = createStripeMock();
mockStripeModule(stripeMock);

const socketMock = {
  broadcastShowtimeSeatsUpdated: jest.fn(),
  broadcastBookingConfirmed: jest.fn(),
  broadcastBookingUpdated: jest.fn(),
  broadcastSeatUpdate: jest.fn(),
};
jest.unstable_mockModule('../../src/sockets/seatSocketGateway.js', () => socketMock);

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
    title: 'Coverage Test Film',
    synopsis: 'A synopsis.',
    certificate: 'PG',
    runtimeMinutes: 120,
    genre: ['Drama'],
    releaseDate: new Date(Date.now() - 86400000),
  });
  const cinema = await Cinema.create({
    name: 'Coverage Test Cinema',
    address: '1 Coverage Ave',
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
    name: 'Coverage Customer',
    email: `coverage-confirm${Math.random().toString(36).slice(2)}@test.com`,
    passwordHash: 'hash',
    phone: `9477${Math.floor(1000000 + Math.random() * 8999999)}`,
    role: 'customer',
    emailVerified: true,
    ...overrides,
  });
}

async function createPaidHold({ paymentIntentId = 'pi_test_confirm_cov' } = {}) {
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

describe('services/confirmService.js — additional coverage (idempotency edge, retry paths, getBookingByHold)', () => {
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

  describe('confirmBooking — consumed hold with no matching booking (extremely-unlikely backstop)', () => {
    it('throws 409 HOLD_NOT_FOUND rather than proceeding silently', async () => {
      const { film, cinema } = await createFilmAndCinema();
      const showtime = await createShowtime({ film, cinema });
      const user = await createUser();

      // A hold already marked 'consumed' with no corresponding Booking row —
      // should never happen in production, but the code must fail loudly
      // rather than fall through.
      const hold = await Hold.create({
        userRef: user._id,
        showtimeRef: showtime._id,
        seatIds: ['A-1'],
        seatSnapshot: [{ id: 'A-1', section: 'STANDARD', price: 1000 }],
        totalPrice: 1000,
        amountMinor: 100000,
        currency: 'LKR',
        status: 'consumed',
        expiresAt: new Date(Date.now() + 600000),
      });

      await expect(
        confirmService.confirmBooking({ holdId: hold._id.toString(), userId: user._id.toString() })
      ).rejects.toMatchObject({ statusCode: 409, code: 'HOLD_NOT_FOUND' });
    });
  });

  describe('fulfilHold — auto-refund itself fails after an allocation failure', () => {
    it('still rejects with 409 ALLOCATION_FAILED (the refund failure is logged, not rethrown)', async () => {
      const { hold, user, showtime } = await createPaidHold();
      stripeMock.paymentIntents.retrieve.mockResolvedValueOnce(succeededIntentFor(hold));
      stripeMock.refunds.create.mockRejectedValueOnce(new Error('refund provider down'));

      // Pre-corrupt the showtime's seat state so allocation fails.
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

  describe('createBookingWithReferenceRetry — duplicate-key races', () => {
    it('a holdRef collision (a racing caller already created this exact booking) returns the SAME existing booking', async () => {
      const { hold, user, showtime } = await createPaidHold();
      stripeMock.paymentIntents.retrieve.mockResolvedValueOnce(succeededIntentFor(hold));

      // Simulate a race: some other process (the reconciler, or a duplicate
      // client retry) already created the Booking for this exact hold,
      // moments before this call reaches Booking.create.
      const racingBooking = await Booking.create({
        reference: 'ENC-RACE1234',
        userRef: user._id,
        showtimeRef: showtime._id,
        holdRef: hold._id,
        paymentIntentId: 'pi_completely_different',
        paymentStatus: 'succeeded',
        seats: [{ id: 'A-1', section: 'STANDARD', row: 'A', number: 1, price: 1000 }],
        totalPrice: 1000,
        status: 'confirmed',
      });

      const booking = await confirmService.confirmBooking({
        holdId: hold._id.toString(),
        userId: user._id.toString(),
      });

      expect(booking._id.toString()).toBe(racingBooking._id.toString());
      expect(await Booking.countDocuments({})).toBe(1);

      const updatedHold = await Hold.findById(hold._id);
      expect(updatedHold.status).toBe('consumed');
    });

    it('a paymentIntentId collision with NO matching holdRef is truly unexpected and rethrows the raw duplicate-key error', async () => {
      const { hold, user, showtime } = await createPaidHold();
      stripeMock.paymentIntents.retrieve.mockResolvedValueOnce(succeededIntentFor(hold));

      // A different booking already holds this exact paymentIntentId, but
      // under a completely unrelated hold — an impossible-in-practice state
      // that the code must still fail loudly on rather than silently
      // returning the wrong booking.
      await Booking.create({
        reference: 'ENC-UNREL8888',
        userRef: user._id,
        showtimeRef: showtime._id,
        holdRef: new mongoose.Types.ObjectId(),
        paymentIntentId: hold.paymentIntentId,
        paymentStatus: 'succeeded',
        seats: [{ id: 'A-1', section: 'STANDARD', row: 'A', number: 1, price: 1000 }],
        totalPrice: 1000,
        status: 'confirmed',
      });

      await expect(
        confirmService.confirmBooking({ holdId: hold._id.toString(), userId: user._id.toString() })
      ).rejects.toMatchObject({ code: 11000 });
    });

    it('a reference collision regenerates once and succeeds on the retry', async () => {
      const { hold, user } = await createPaidHold();
      stripeMock.paymentIntents.retrieve.mockResolvedValueOnce(succeededIntentFor(hold));

      const fixedNow = 1735689600123;
      const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(fixedNow);

      try {
        // generateBookingReference() is deterministic while Math.random/Date.now
        // are pinned — pre-seed a booking with EXACTLY the reference the first
        // attempt inside fulfilHold will generate, forcing a collision on
        // `reference` specifically (not holdRef/paymentIntentId). With
        // Math.random pinned to 0, each of the 4 random chars is chars[0] = 'A'.
        const collidingReference = `ENC-AAAA${String(fixedNow).slice(-4)}`;
        await Booking.create({
          reference: collidingReference,
          userRef: new mongoose.Types.ObjectId(),
          showtimeRef: new mongoose.Types.ObjectId(),
          holdRef: new mongoose.Types.ObjectId(),
          paymentIntentId: 'pi_unrelated_reference_seed',
          paymentStatus: 'succeeded',
          seats: [{ id: 'Z-9', section: 'STANDARD', row: 'Z', number: 9, price: 1000 }],
          totalPrice: 1000,
          status: 'confirmed',
        });

        const booking = await confirmService.confirmBooking({
          holdId: hold._id.toString(),
          userId: user._id.toString(),
        });

        expect(booking.reference).not.toBe(collidingReference);
        expect(booking.reference.startsWith(collidingReference)).toBe(true);
        expect(await Booking.countDocuments({})).toBe(2);
      } finally {
        randomSpy.mockRestore();
        nowSpy.mockRestore();
      }
    });

    it('a reference collision on BOTH the original attempt and the regenerated retry rethrows the second raw duplicate-key error', async () => {
      const { hold, user } = await createPaidHold();
      stripeMock.paymentIntents.retrieve.mockResolvedValueOnce(succeededIntentFor(hold));

      const fixedNow = 1735689600123;
      const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(fixedNow);

      try {
        const firstAttemptReference = `ENC-AAAA${String(fixedNow).slice(-4)}`;
        // With Math.random pinned to 0, the retry's suffix is also 0.
        const retryReference = `${firstAttemptReference}-0`;

        const seedBooking = (reference) =>
          Booking.create({
            reference,
            userRef: new mongoose.Types.ObjectId(),
            showtimeRef: new mongoose.Types.ObjectId(),
            holdRef: new mongoose.Types.ObjectId(),
            paymentIntentId: `pi_seed_${reference}`,
            paymentStatus: 'succeeded',
            seats: [{ id: 'Z-9', section: 'STANDARD', row: 'Z', number: 9, price: 1000 }],
            totalPrice: 1000,
            status: 'confirmed',
          });

        // Pre-seed BOTH the reference the first attempt will generate and
        // the one the regenerated retry will generate, so neither create
        // call can succeed — forcing the code into the "second attempt also
        // collided" branch (lines 262-266).
        await seedBooking(firstAttemptReference);
        await seedBooking(retryReference);

        await expect(
          confirmService.confirmBooking({ holdId: hold._id.toString(), userId: user._id.toString() })
        ).rejects.toMatchObject({ code: 11000 });

        // Neither seed booking is this hold's — no booking was ever
        // fulfilled for it, and the hold is left active/unconsumed since
        // fulfilment failed outright.
        const stillActiveHold = await Hold.findById(hold._id);
        expect(stillActiveHold.status).toBe('active');
      } finally {
        randomSpy.mockRestore();
        nowSpy.mockRestore();
      }
    });
  });

  describe('getBookingByHold', () => {
    it('returns the booking for its owner', async () => {
      const { hold, user } = await createPaidHold();
      stripeMock.paymentIntents.retrieve.mockResolvedValueOnce(succeededIntentFor(hold));
      const booking = await confirmService.confirmBooking({
        holdId: hold._id.toString(),
        userId: user._id.toString(),
      });

      const found = await confirmService.getBookingByHold(hold._id.toString(), {
        userId: user._id.toString(),
        role: 'customer',
      });

      expect(found._id.toString()).toBe(booking._id.toString());
    });

    it('allows an admin to view any booking by hold', async () => {
      const { hold, user } = await createPaidHold();
      stripeMock.paymentIntents.retrieve.mockResolvedValueOnce(succeededIntentFor(hold));
      await confirmService.confirmBooking({ holdId: hold._id.toString(), userId: user._id.toString() });

      const found = await confirmService.getBookingByHold(hold._id.toString(), {
        userId: new mongoose.Types.ObjectId().toString(),
        role: 'admin',
      });

      expect(found).toBeTruthy();
    });

    it('rejects a non-owner, non-admin caller with 403 FORBIDDEN', async () => {
      const { hold, user } = await createPaidHold();
      stripeMock.paymentIntents.retrieve.mockResolvedValueOnce(succeededIntentFor(hold));
      await confirmService.confirmBooking({ holdId: hold._id.toString(), userId: user._id.toString() });

      await expect(
        confirmService.getBookingByHold(hold._id.toString(), {
          userId: new mongoose.Types.ObjectId().toString(),
          role: 'customer',
        })
      ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    });

    it('returns 404 BOOKING_NOT_FOUND when no booking has been fulfilled yet for that hold', async () => {
      const { hold, user } = await createPaidHold();

      await expect(
        confirmService.getBookingByHold(hold._id.toString(), {
          userId: user._id.toString(),
          role: 'customer',
        })
      ).rejects.toMatchObject({ statusCode: 404, code: 'BOOKING_NOT_FOUND' });
    });
  });
});
