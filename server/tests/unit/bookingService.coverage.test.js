import { describe, it, expect, beforeAll, beforeEach, afterAll, jest } from '@jest/globals';
import mongoose from 'mongoose';
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import { createStripeMock, mockStripeModule } from '../helpers/mocks.js';
import Showtime from '../../src/models/Showtime.js';
import Booking from '../../src/models/Booking.js';
import User from '../../src/models/User.js';

// Stripe must be mocked before the dynamic import of bookingService.js below
// (cancelBooking refunds a confirmed booking via paymentService).
const stripeMock = createStripeMock();
mockStripeModule(stripeMock);

let bookingService;

function seatFixture(overrides = {}) {
  return {
    id: 'A-1',
    section: 'STANDARD',
    row: 'A',
    number: 1,
    tier: 'STANDARD',
    price: 1000,
    status: 'booked',
    ...overrides,
  };
}

async function createShowtime(overrides = {}) {
  return Showtime.create({
    filmRef: new mongoose.Types.ObjectId(),
    cinemaRef: new mongoose.Types.ObjectId(),
    screenId: '1',
    screenName: 'Screen 1',
    startsAt: new Date(Date.now() + 86400000),
    basePrice: 1000,
    status: 'scheduled',
    seats: [seatFixture()],
    ...overrides,
  });
}

async function createUser(overrides = {}) {
  return User.create({
    name: 'Coverage User',
    email: `coverage${Math.random().toString(36).slice(2)}@test.com`,
    passwordHash: 'hash',
    phone: `9477${Math.floor(1000000 + Math.random() * 8999999)}`,
    role: 'customer',
    ...overrides,
  });
}

async function createBooking({ user, showtime, overrides = {} } = {}) {
  return Booking.create({
    reference: `ENC-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    userRef: user._id,
    showtimeRef: showtime._id,
    holdRef: new mongoose.Types.ObjectId(),
    paymentIntentId: `pi_${Math.random().toString(36).slice(2, 10)}`,
    paymentStatus: 'succeeded',
    seats: [{ id: 'A-1', section: 'STANDARD', row: 'A', number: 1, price: 1000 }],
    totalPrice: 1000,
    status: 'confirmed',
    ...overrides,
  });
}

describe('services/bookingService.js — additional coverage (guard branch, listing endpoints)', () => {
  beforeAll(async () => {
    await connectTestDB();
    bookingService = await import('../../src/services/bookingService.js');
  });

  afterAll(async () => {
    await closeTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
    jest.clearAllMocks();
  });

  describe('cancelBooking — non-cancellable status guard', () => {
    it('rejects with 400 BOOKING_NOT_CANCELLABLE for a status outside pending/confirmed/cancelled', async () => {
      const user = await createUser();
      const showtime = await createShowtime();
      const booking = await createBooking({ user, showtime });

      // The current schema only allows 'confirmed'/'cancelled', so this
      // branch (a status that is neither 'cancelled' — handled earlier as a
      // no-op — nor in ['pending', 'confirmed']) is reached by writing an
      // out-of-enum value directly via the raw driver, bypassing Mongoose's
      // save-time validation the way a legacy/corrupted row could.
      await Booking.collection.updateOne({ _id: booking._id }, { $set: { status: 'refunded' } });

      await expect(
        bookingService.cancelBooking({
          userId: user._id.toString(),
          bookingId: booking._id.toString(),
          role: 'customer',
        })
      ).rejects.toMatchObject({ statusCode: 400, code: 'BOOKING_NOT_CANCELLABLE' });
    });
  });

  describe('cancelBooking — confirmed booking with no paymentIntentId (legacy/corrupted data)', () => {
    it('skips the refund call but still cancels, releases seats, and notifies', async () => {
      const user = await createUser();
      const showtime = await createShowtime();
      const booking = await createBooking({ user, showtime });
      // paymentIntentId is `required` in the schema, so this out-of-band
      // state (confirmed with no payment intent) can only arise from
      // legacy/corrupted data — simulated here by unsetting it directly on
      // the fetched document and stubbing `save()` for this one call so the
      // (irrelevant to this branch) required-field validator doesn't block
      // exercising the `wasConfirmed && booking.paymentIntentId` check.
      booking.paymentIntentId = undefined;
      const saveSpy = jest.spyOn(Booking.prototype, 'save').mockImplementationOnce(async function stubbedSave() {
        return this;
      });
      jest.spyOn(Booking, 'findById').mockResolvedValueOnce(booking);

      const cancelled = await bookingService.cancelBooking({
        userId: user._id.toString(),
        bookingId: booking._id.toString(),
        role: 'customer',
      });

      expect(cancelled.status).toBe('cancelled');
      expect(stripeMock.refunds.create).not.toHaveBeenCalled();

      const updatedShowtime = await Showtime.findById(showtime._id);
      expect(updatedShowtime.seats[0].status).toBe('available');

      saveSpy.mockRestore();
      Booking.findById.mockRestore();
    });
  });

  describe('getUserBookings', () => {
    it('returns only the requesting user\'s bookings, newest first, with pagination metadata', async () => {
      const user = await createUser();
      const otherUser = await createUser();
      const showtime = await createShowtime();

      const older = await createBooking({ user, showtime });
      await new Promise((resolve) => setTimeout(resolve, 5));
      const newer = await createBooking({ user, showtime });
      await createBooking({ user: otherUser, showtime });

      const result = await bookingService.getUserBookings(user._id.toString());

      expect(result.total).toBe(2);
      expect(result.items).toHaveLength(2);
      expect(result.items[0]._id.toString()).toBe(newer._id.toString());
      expect(result.items[1]._id.toString()).toBe(older._id.toString());
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.totalPages).toBe(1);
      // showtimeRef is populated with the projected fields
      expect(result.items[0].showtimeRef.screenName).toBe('Screen 1');
    });

    it('clamps page/limit to sane bounds and paginates correctly', async () => {
      const user = await createUser();
      const showtime = await createShowtime();
      for (let i = 0; i < 3; i++) {
        await createBooking({ user, showtime });
      }

      const page1 = await bookingService.getUserBookings(user._id.toString(), { page: 1, limit: 2 });
      expect(page1.items).toHaveLength(2);
      expect(page1.totalPages).toBe(2);

      const page2 = await bookingService.getUserBookings(user._id.toString(), { page: 2, limit: 2 });
      expect(page2.items).toHaveLength(1);

      // A negative page clamps to 1 rather than throwing or going negative.
      // limit: 0 is falsy, so `parseInt(limit, 10) || 10` falls back to the
      // default of 10 (not 1) — this documents that actual `|| 10` behaviour.
      const clamped = await bookingService.getUserBookings(user._id.toString(), { page: -5, limit: 0 });
      expect(clamped.page).toBe(1);
      expect(clamped.limit).toBe(10);

      // an oversized limit clamps to the 100 cap
      const capped = await bookingService.getUserBookings(user._id.toString(), { page: 1, limit: 500 });
      expect(capped.limit).toBe(100);

      // a non-numeric page falls back to page 1 via the `parseInt(...) || 1` guard
      const nonNumericPage = await bookingService.getUserBookings(user._id.toString(), { page: 'abc', limit: 2 });
      expect(nonNumericPage.page).toBe(1);
    });
  });

  describe('getAllBookings', () => {
    it('returns every booking across users for an admin, with the owner populated', async () => {
      const user = await createUser();
      const otherUser = await createUser();
      const showtime = await createShowtime();
      await createBooking({ user, showtime });
      await createBooking({ user: otherUser, showtime });

      const result = await bookingService.getAllBookings();

      expect(result.total).toBe(2);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].userRef.email).toBeDefined();
      expect(result.limit).toBe(20);
      expect(result.page).toBe(1);
    });

    it('filters by showtimeId when provided', async () => {
      const user = await createUser();
      const showtimeA = await createShowtime();
      const showtimeB = await createShowtime();
      await createBooking({ user, showtime: showtimeA });
      await createBooking({ user, showtime: showtimeB });

      const result = await bookingService.getAllBookings({ showtimeId: showtimeA._id.toString() });

      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].showtimeRef._id.toString()).toBe(showtimeA._id.toString());
    });

    it('clamps page/limit the same way getUserBookings does', async () => {
      const user = await createUser();
      const showtime = await createShowtime();
      await createBooking({ user, showtime });

      const result = await bookingService.getAllBookings({ page: 0, limit: -3 });
      expect(result.page).toBe(1);
      expect(result.limit).toBe(1);

      const cappedResult = await bookingService.getAllBookings({ page: 1, limit: 1000 });
      expect(cappedResult.limit).toBe(100);

      const nonNumericPage = await bookingService.getAllBookings({ page: 'abc', limit: 2 });
      expect(nonNumericPage.page).toBe(1);
    });
  });
});
