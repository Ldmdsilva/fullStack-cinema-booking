import { describe, it, expect, beforeAll, beforeEach, afterAll, jest } from '@jest/globals';
import mongoose from 'mongoose';
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import { createStripeMock, mockStripeModule } from '../helpers/mocks.js';
import { setIO } from '../../src/config/socket.js';
import Showtime from '../../src/models/Showtime.js';
import Hold from '../../src/models/Hold.js';
import User from '../../src/models/User.js';

const stripeMock = createStripeMock();
mockStripeModule(stripeMock);

function createFakeIO() {
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit }));
  return { to, emit };
}

let holdService;

function seatFixture(overrides = {}) {
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

async function createShowtime(overrides = {}) {
  return Showtime.create({
    filmRef: new mongoose.Types.ObjectId(),
    cinemaRef: new mongoose.Types.ObjectId(),
    screenId: '1',
    screenName: 'Screen 1',
    startsAt: new Date(Date.now() + 86400000),
    basePrice: 1000,
    status: 'scheduled',
    seats: [seatFixture(), seatFixture({ id: 'A-2', price: 1350, tier: 'PREMIUM' })],
    ...overrides,
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

describe('services/holdService.js (§C6.2, D6, D12)', () => {
  let fakeIO;

  beforeAll(async () => {
    await connectTestDB();
    holdService = await import('../../src/services/holdService.js');
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

  describe('createHold', () => {
    it('creates an active hold, flips seats to held, freezes price, and broadcasts', async () => {
      const showtime = await createShowtime();
      const user = await createUser();

      const hold = await holdService.createHold({
        userId: user._id.toString(),
        showtimeId: showtime._id.toString(),
        seatIds: ['A-1'],
      });

      expect(hold.status).toBe('active');
      expect(hold.seatIds).toEqual(['A-1']);
      expect(hold.seatSnapshot).toHaveLength(1);
      expect(hold.seatSnapshot[0]).toMatchObject({ id: 'A-1', section: 'STANDARD', price: 1000 });
      expect(hold.totalPrice).toBe(1000);
      expect(hold.amountMinor).toBe(1000);
      expect(hold.currency).toBe('LKR');

      const updatedShowtime = await Showtime.findById(showtime._id);
      const seat = updatedShowtime.seats.find((s) => s.id === 'A-1');
      expect(seat.status).toBe('held');
      expect(seat.holdRef.toString()).toBe(hold._id.toString());
      expect(seat.holdExpiresAt).toBeInstanceOf(Date);

      expect(fakeIO.to).toHaveBeenCalledWith(`showtime:${showtime._id.toString()}`);
      expect(fakeIO.emit).toHaveBeenCalledWith('seats:updated', {
        showtimeId: showtime._id.toString(),
        seatIds: ['A-1'],
        status: 'held',
      });
    });

    it('dedupes repeated seat ids', async () => {
      const showtime = await createShowtime();
      const user = await createUser();

      const hold = await holdService.createHold({
        userId: user._id.toString(),
        showtimeId: showtime._id.toString(),
        seatIds: ['A-1', 'A-1'],
      });

      expect(hold.seatIds).toEqual(['A-1']);
    });

    it('throws SHOWTIME_NOT_FOUND for a non-existent showtime', async () => {
      const user = await createUser();
      await expect(
        holdService.createHold({
          userId: user._id.toString(),
          showtimeId: new mongoose.Types.ObjectId().toString(),
          seatIds: ['A-1'],
        })
      ).rejects.toMatchObject({ statusCode: 404, code: 'SHOWTIME_NOT_FOUND' });
    });

    it('throws SHOWTIME_CANCELLED when the showtime is not scheduled', async () => {
      const showtime = await createShowtime({ status: 'cancelled' });
      const user = await createUser();

      await expect(
        holdService.createHold({
          userId: user._id.toString(),
          showtimeId: showtime._id.toString(),
          seatIds: ['A-1'],
        })
      ).rejects.toMatchObject({ statusCode: 400, code: 'SHOWTIME_CANCELLED' });
    });

    it('throws SHOWTIME_STARTED when the showtime has already begun', async () => {
      const showtime = await createShowtime({ startsAt: new Date(Date.now() - 1000) });
      const user = await createUser();

      await expect(
        holdService.createHold({
          userId: user._id.toString(),
          showtimeId: showtime._id.toString(),
          seatIds: ['A-1'],
        })
      ).rejects.toMatchObject({ statusCode: 400, code: 'SHOWTIME_STARTED' });
    });

    it('throws SEAT_NOT_FOUND for a seat id that does not exist on the showtime', async () => {
      const showtime = await createShowtime();
      const user = await createUser();

      await expect(
        holdService.createHold({
          userId: user._id.toString(),
          showtimeId: showtime._id.toString(),
          seatIds: ['ZZZ'],
        })
      ).rejects.toMatchObject({ statusCode: 400, code: 'SEAT_NOT_FOUND' });
    });

    it('throws SEAT_UNAVAILABLE (409) when a seat is already held', async () => {
      const showtime = await createShowtime({
        seats: [seatFixture({ status: 'held' })],
      });
      const user = await createUser();

      await expect(
        holdService.createHold({
          userId: user._id.toString(),
          showtimeId: showtime._id.toString(),
          seatIds: ['A-1'],
        })
      ).rejects.toMatchObject({ statusCode: 409, code: 'SEAT_UNAVAILABLE' });

      const holdCount = await Hold.countDocuments({});
      expect(holdCount).toBe(0);
    });

    it('honours a ttlMs override in place of env.HOLD_TTL_MINUTES (test-only escape hatch, §D4.4 J5)', async () => {
      const showtime = await createShowtime();
      const user = await createUser();
      const before = Date.now();

      const hold = await holdService.createHold({
        userId: user._id.toString(),
        showtimeId: showtime._id.toString(),
        seatIds: ['A-1'],
        ttlMs: 5000,
      });

      const expiresInMs = hold.expiresAt.getTime() - before;
      // Comfortably inside the 5s override and nowhere near the real
      // HOLD_TTL_MINUTES default (10 minutes) — proves the override, not the
      // configured default, drove this hold's expiry.
      expect(expiresInMs).toBeGreaterThan(0);
      expect(expiresInMs).toBeLessThanOrEqual(6000);
    });

    it('ignores a non-positive or non-finite ttlMs and falls back to env.HOLD_TTL_MINUTES', async () => {
      const showtime = await createShowtime();
      const user = await createUser();
      const before = Date.now();

      const hold = await holdService.createHold({
        userId: user._id.toString(),
        showtimeId: showtime._id.toString(),
        seatIds: ['A-1'],
        ttlMs: -1,
      });

      const expiresInMs = hold.expiresAt.getTime() - before;
      // env.HOLD_TTL_MINUTES defaults to 10 in this suite's environment —
      // a bogus override must never shrink that to something e2e-fast.
      expect(expiresInMs).toBeGreaterThan(6000);
    });

    it('throws VALIDATION_ERROR for an empty seatIds array', async () => {
      const user = await createUser();
      await expect(
        holdService.createHold({
          userId: user._id.toString(),
          showtimeId: new mongoose.Types.ObjectId().toString(),
          seatIds: [],
        })
      ).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    });
  });

  describe('getHoldById', () => {
    it('returns the hold for its owner', async () => {
      const showtime = await createShowtime();
      const user = await createUser();
      const hold = await holdService.createHold({
        userId: user._id.toString(),
        showtimeId: showtime._id.toString(),
        seatIds: ['A-1'],
      });

      const found = await holdService.getHoldById(hold._id.toString(), {
        userId: user._id.toString(),
        role: 'customer',
      });
      expect(found._id.toString()).toBe(hold._id.toString());
    });

    it('allows an admin to view any hold', async () => {
      const showtime = await createShowtime();
      const user = await createUser();
      const hold = await holdService.createHold({
        userId: user._id.toString(),
        showtimeId: showtime._id.toString(),
        seatIds: ['A-1'],
      });

      const found = await holdService.getHoldById(hold._id.toString(), {
        userId: new mongoose.Types.ObjectId().toString(),
        role: 'admin',
      });
      expect(found._id.toString()).toBe(hold._id.toString());
    });

    it('throws HOLD_NOT_FOUND for a non-existent hold', async () => {
      await expect(
        holdService.getHoldById(new mongoose.Types.ObjectId().toString(), {
          userId: new mongoose.Types.ObjectId().toString(),
          role: 'customer',
        })
      ).rejects.toMatchObject({ statusCode: 404, code: 'HOLD_NOT_FOUND' });
    });

    it('throws FORBIDDEN when a non-owner customer requests the hold', async () => {
      const showtime = await createShowtime();
      const user = await createUser();
      const hold = await holdService.createHold({
        userId: user._id.toString(),
        showtimeId: showtime._id.toString(),
        seatIds: ['A-1'],
      });

      await expect(
        holdService.getHoldById(hold._id.toString(), {
          userId: new mongoose.Types.ObjectId().toString(),
          role: 'customer',
        })
      ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    });
  });

  describe('createPaymentIntentForHold', () => {
    it('creates a PaymentIntent for an active hold and persists its id', async () => {
      const showtime = await createShowtime();
      const user = await createUser();
      const hold = await holdService.createHold({
        userId: user._id.toString(),
        showtimeId: showtime._id.toString(),
        seatIds: ['A-1'],
      });

      const result = await holdService.createPaymentIntentForHold({
        holdId: hold._id.toString(),
        userId: user._id.toString(),
      });

      expect(result.clientSecret).toBe('pi_test_mock_intent_secret');
      expect(result.publishableKey).toBeDefined();
      expect(stripeMock.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 1000, currency: 'LKR' }),
        { idempotencyKey: hold._id.toString() }
      );

      const stored = await Hold.findById(hold._id);
      expect(stored.paymentIntentId).toBe('pi_test_mock_intent');
    });

    it('re-retrieves (does not re-create) the intent on a second call', async () => {
      const showtime = await createShowtime();
      const user = await createUser();
      const hold = await holdService.createHold({
        userId: user._id.toString(),
        showtimeId: showtime._id.toString(),
        seatIds: ['A-1'],
      });

      await holdService.createPaymentIntentForHold({ holdId: hold._id.toString(), userId: user._id.toString() });
      const second = await holdService.createPaymentIntentForHold({
        holdId: hold._id.toString(),
        userId: user._id.toString(),
      });

      expect(stripeMock.paymentIntents.create).toHaveBeenCalledTimes(1);
      expect(stripeMock.paymentIntents.retrieve).toHaveBeenCalledWith('pi_test_mock_intent');
      expect(second.clientSecret).toBe('pi_test_mock_intent_secret');
    });

    it('throws HOLD_NOT_FOUND for a non-existent hold', async () => {
      await expect(
        holdService.createPaymentIntentForHold({
          holdId: new mongoose.Types.ObjectId().toString(),
          userId: new mongoose.Types.ObjectId().toString(),
        })
      ).rejects.toMatchObject({ statusCode: 404, code: 'HOLD_NOT_FOUND' });
    });

    it('throws FORBIDDEN for a non-owner', async () => {
      const showtime = await createShowtime();
      const user = await createUser();
      const hold = await holdService.createHold({
        userId: user._id.toString(),
        showtimeId: showtime._id.toString(),
        seatIds: ['A-1'],
      });

      await expect(
        holdService.createPaymentIntentForHold({
          holdId: hold._id.toString(),
          userId: new mongoose.Types.ObjectId().toString(),
        })
      ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    });

    it('throws HOLD_EXPIRED (409) for an expired hold', async () => {
      const showtime = await createShowtime();
      const user = await createUser();
      const hold = await Hold.create({
        userRef: user._id,
        showtimeRef: showtime._id,
        seatIds: ['A-1'],
        seatSnapshot: [{ id: 'A-1', section: 'STANDARD', price: 1000 }],
        totalPrice: 1000,
        amountMinor: 1000,
        currency: 'LKR',
        status: 'active',
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        holdService.createPaymentIntentForHold({ holdId: hold._id.toString(), userId: user._id.toString() })
      ).rejects.toMatchObject({ statusCode: 409, code: 'HOLD_EXPIRED' });
    });

    it('throws HOLD_EXPIRED (409) for a released hold', async () => {
      const showtime = await createShowtime();
      const user = await createUser();
      const hold = await Hold.create({
        userRef: user._id,
        showtimeRef: showtime._id,
        seatIds: ['A-1'],
        seatSnapshot: [{ id: 'A-1', section: 'STANDARD', price: 1000 }],
        totalPrice: 1000,
        amountMinor: 1000,
        currency: 'LKR',
        status: 'released',
        expiresAt: new Date(Date.now() + 60000),
      });

      await expect(
        holdService.createPaymentIntentForHold({ holdId: hold._id.toString(), userId: user._id.toString() })
      ).rejects.toMatchObject({ statusCode: 409, code: 'HOLD_EXPIRED' });
    });
  });

  describe('releaseHold', () => {
    it('releases an active hold, frees its seats, and broadcasts', async () => {
      const showtime = await createShowtime();
      const user = await createUser();
      const hold = await holdService.createHold({
        userId: user._id.toString(),
        showtimeId: showtime._id.toString(),
        seatIds: ['A-1'],
      });
      jest.clearAllMocks();

      const released = await holdService.releaseHold({
        holdId: hold._id.toString(),
        userId: user._id.toString(),
        role: 'customer',
      });

      expect(released.status).toBe('released');

      const updatedShowtime = await Showtime.findById(showtime._id);
      const seat = updatedShowtime.seats.find((s) => s.id === 'A-1');
      expect(seat.status).toBe('available');
      expect(seat.holdRef).toBeUndefined();
      expect(seat.holdExpiresAt).toBeUndefined();

      expect(fakeIO.emit).toHaveBeenCalledWith('seats:updated', {
        showtimeId: showtime._id.toString(),
        seatIds: ['A-1'],
        status: 'available',
      });
    });

    it('cancels a live PaymentIntent on release, tolerating a Stripe failure', async () => {
      const showtime = await createShowtime();
      const user = await createUser();
      const hold = await holdService.createHold({
        userId: user._id.toString(),
        showtimeId: showtime._id.toString(),
        seatIds: ['A-1'],
      });
      await holdService.createPaymentIntentForHold({ holdId: hold._id.toString(), userId: user._id.toString() });

      const released = await holdService.releaseHold({
        holdId: hold._id.toString(),
        userId: user._id.toString(),
        role: 'customer',
      });

      expect(released.status).toBe('released');
      expect(stripeMock.paymentIntents.cancel).toHaveBeenCalledWith('pi_test_mock_intent');
    });

    it('is idempotent: releasing twice does not error', async () => {
      const showtime = await createShowtime();
      const user = await createUser();
      const hold = await holdService.createHold({
        userId: user._id.toString(),
        showtimeId: showtime._id.toString(),
        seatIds: ['A-1'],
      });

      const first = await holdService.releaseHold({
        holdId: hold._id.toString(),
        userId: user._id.toString(),
        role: 'customer',
      });
      const second = await holdService.releaseHold({
        holdId: hold._id.toString(),
        userId: user._id.toString(),
        role: 'customer',
      });

      expect(first.status).toBe('released');
      expect(second.status).toBe('released');
    });

    it('throws HOLD_NOT_FOUND for a non-existent hold', async () => {
      await expect(
        holdService.releaseHold({
          holdId: new mongoose.Types.ObjectId().toString(),
          userId: new mongoose.Types.ObjectId().toString(),
          role: 'customer',
        })
      ).rejects.toMatchObject({ statusCode: 404, code: 'HOLD_NOT_FOUND' });
    });

    it('throws FORBIDDEN for a non-owner customer', async () => {
      const showtime = await createShowtime();
      const user = await createUser();
      const hold = await holdService.createHold({
        userId: user._id.toString(),
        showtimeId: showtime._id.toString(),
        seatIds: ['A-1'],
      });

      await expect(
        holdService.releaseHold({
          holdId: hold._id.toString(),
          userId: new mongoose.Types.ObjectId().toString(),
          role: 'customer',
        })
      ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    });
  });
});
