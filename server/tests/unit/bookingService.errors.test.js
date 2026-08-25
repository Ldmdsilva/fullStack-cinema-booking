import { describe, it, expect, beforeAll, beforeEach, afterAll, jest } from '@jest/globals';
import mongoose from 'mongoose';
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import { createStripeMock, mockStripeModule } from '../helpers/mocks.js';
import { setIO } from '../../src/config/socket.js';
import Showtime from '../../src/models/Showtime.js';
import Booking from '../../src/models/Booking.js';
import User from '../../src/models/User.js';

// Stripe must be mocked before the dynamic import of bookingService.js below
// — a confirmed booking's cancellation refunds via paymentService.
const stripeMock = createStripeMock();
mockStripeModule(stripeMock);

let bookingService;

function createFakeIO() {
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit }));
  return { to, emit };
}

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

async function createConfirmedBooking({ user, showtime, paymentIntentId } = {}) {
  return Booking.create({
    reference: `ENC-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    userRef: user._id,
    showtimeRef: showtime._id,
    holdRef: new mongoose.Types.ObjectId(),
    paymentIntentId: paymentIntentId || `pi_${Math.random().toString(36).slice(2, 10)}`,
    paymentStatus: 'succeeded',
    seats: [{ id: 'A-1', section: 'STANDARD', row: 'A', number: 1, price: 1000 }],
    totalPrice: 1000,
    status: 'confirmed',
  });
}

describe('services/bookingService.js — Showtime-based cancelBooking/getBookingById (raises branch coverage)', () => {
  let fakeIO;

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
    fakeIO = createFakeIO();
    setIO(fakeIO);
  });

  describe('cancelBooking guards', () => {
    it('rejects cancelling a non-existent booking with 404 BOOKING_NOT_FOUND', async () => {
      const user = await createUser();
      await expect(
        bookingService.cancelBooking({
          userId: user._id.toString(),
          bookingId: new mongoose.Types.ObjectId().toString(),
          role: 'customer',
        })
      ).rejects.toMatchObject({ statusCode: 404, code: 'BOOKING_NOT_FOUND' });
    });

    it('rejects cancelling another customer\'s booking with 403 FORBIDDEN', async () => {
      const user = await createUser();
      const otherUser = await createUser();
      const showtime = await createShowtime();
      const booking = await createConfirmedBooking({ user, showtime });

      await expect(
        bookingService.cancelBooking({
          userId: otherUser._id.toString(),
          bookingId: booking._id.toString(),
          role: 'customer',
        })
      ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    });

    it('is idempotent: cancelling an already-cancelled booking just returns it', async () => {
      const user = await createUser();
      const showtime = await createShowtime();
      const booking = await createConfirmedBooking({ user, showtime });
      booking.status = 'cancelled';
      await booking.save();

      const result = await bookingService.cancelBooking({
        userId: user._id.toString(),
        bookingId: booking._id.toString(),
        role: 'customer',
      });
      expect(result.status).toBe('cancelled');
    });

    it('rejects cancelling a booking for a showtime that has already started with 400 SHOWTIME_STARTED', async () => {
      const user = await createUser();
      const pastShowtime = await createShowtime({ startsAt: new Date(Date.now() - 3600000) });
      const booking = await createConfirmedBooking({ user, showtime: pastShowtime });

      await expect(
        bookingService.cancelBooking({
          userId: user._id.toString(),
          bookingId: booking._id.toString(),
          role: 'customer',
        })
      ).rejects.toMatchObject({ statusCode: 400, code: 'SHOWTIME_STARTED' });
    });

    it('an admin may cancel any customer\'s booking regardless of ownership', async () => {
      const user = await createUser();
      const showtime = await createShowtime();
      const booking = await createConfirmedBooking({ user, showtime });

      const cancelled = await bookingService.cancelBooking({
        userId: new mongoose.Types.ObjectId().toString(), // not the owner
        bookingId: booking._id.toString(),
        role: 'admin',
      });

      expect(cancelled.status).toBe('cancelled');
    });

    it('releases the booking\'s seats back to available and broadcasts via the showtime room', async () => {
      const user = await createUser();
      const showtime = await createShowtime();
      const booking = await createConfirmedBooking({ user, showtime });

      const cancelled = await bookingService.cancelBooking({
        userId: user._id.toString(),
        bookingId: booking._id.toString(),
        role: 'customer',
      });

      expect(cancelled.status).toBe('cancelled');

      const updatedShowtime = await Showtime.findById(showtime._id);
      expect(updatedShowtime.seats[0].status).toBe('available');

      expect(fakeIO.to).toHaveBeenCalledWith(`showtime:${showtime._id.toString()}`);
      expect(fakeIO.emit).toHaveBeenCalledWith('seats:updated', {
        showtimeId: showtime._id.toString(),
        seatIds: ['A-1'],
        status: 'available',
      });
    });

    it('refunds via the new top-level paymentIntentId before flipping a confirmed booking to cancelled', async () => {
      const user = await createUser();
      const showtime = await createShowtime();
      const booking = await createConfirmedBooking({ user, showtime, paymentIntentId: 'pi_refund_test' });

      const cancelled = await bookingService.cancelBooking({
        userId: user._id.toString(),
        bookingId: booking._id.toString(),
        role: 'customer',
      });

      expect(cancelled.status).toBe('cancelled');
      expect(stripeMock.refunds.create).toHaveBeenCalledWith({ payment_intent: 'pi_refund_test' });

      const updatedShowtime = await Showtime.findById(showtime._id);
      expect(updatedShowtime.seats[0].status).toBe('available');
    });
  });

  describe('getBookingById', () => {
    it('rejects a non-existent booking with 404 BOOKING_NOT_FOUND', async () => {
      const user = await createUser();
      await expect(
        bookingService.getBookingById({
          bookingId: new mongoose.Types.ObjectId().toString(),
          userId: user._id.toString(),
          role: 'customer',
        })
      ).rejects.toMatchObject({ statusCode: 404, code: 'BOOKING_NOT_FOUND' });
    });

    it('rejects a customer viewing another customer\'s booking with 403 FORBIDDEN', async () => {
      const user = await createUser();
      const otherUser = await createUser();
      const showtime = await createShowtime();
      const booking = await createConfirmedBooking({ user, showtime });

      await expect(
        bookingService.getBookingById({
          bookingId: booking._id.toString(),
          userId: otherUser._id.toString(),
          role: 'customer',
        })
      ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    });

    it('allows the owner and an admin to view the booking, with the showtime populated', async () => {
      const user = await createUser();
      const showtime = await createShowtime();
      const booking = await createConfirmedBooking({ user, showtime });

      const asOwner = await bookingService.getBookingById({
        bookingId: booking._id.toString(),
        userId: user._id.toString(),
        role: 'customer',
      });
      expect(asOwner.reference).toBe(booking.reference);
      expect(asOwner.showtimeRef.screenName).toBe('Screen 1');

      const asAdmin = await bookingService.getBookingById({
        bookingId: booking._id.toString(),
        userId: new mongoose.Types.ObjectId().toString(),
        role: 'admin',
      });
      expect(asAdmin.reference).toBe(booking.reference);
    });
  });
});
