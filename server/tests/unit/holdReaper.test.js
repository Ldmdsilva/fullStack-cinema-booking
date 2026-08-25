import { describe, it, expect, beforeAll, beforeEach, afterAll, jest } from '@jest/globals';
import mongoose from 'mongoose';
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import { createStripeMock, mockStripeModule } from '../helpers/mocks.js';
import Showtime from '../../src/models/Showtime.js';
import Hold from '../../src/models/Hold.js';
import User from '../../src/models/User.js';

// Stripe must be mocked before the dynamic import of holdReaper.js below —
// releaseExpiredHold() cancels a live PaymentIntent for a paid-but-expired
// hold.
const stripeMock = createStripeMock();
mockStripeModule(stripeMock);

// The socket gateway must also be mocked before the dynamic import, since
// getIO() has no real Socket.IO server in this test and we want to assert
// the broadcast actually happens rather than being silently swallowed by
// the gateway's own try/catch.
const socketMock = {
  broadcastShowtimeSeatsUpdated: jest.fn(),
};
jest.unstable_mockModule('../../src/sockets/seatSocketGateway.js', () => socketMock);

let reapExpiredHoldsForShowtime;
let reapAllExpiredHolds;
let releaseSeatsForHold;

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

async function seedShowtimeWithSeats(seats) {
  return Showtime.create({
    filmRef: new mongoose.Types.ObjectId(),
    cinemaRef: new mongoose.Types.ObjectId(),
    screenId: '1',
    screenName: 'Screen 1',
    startsAt: new Date(Date.now() + 86400000),
    basePrice: 1000,
    status: 'scheduled',
    seats,
  });
}

async function seedHoldUser() {
  return User.create({
    name: 'Hold Reaper User',
    email: `holdreaper${Math.random().toString(36).slice(2)}@test.com`,
    passwordHash: 'hash',
    phone: `9477${Math.floor(1000000 + Math.random() * 8999999)}`,
    role: 'customer',
    emailVerified: true,
  });
}

describe('jobs/holdReaper.js (Showtime/Hold domain, ADR-014)', () => {
  beforeAll(async () => {
    await connectTestDB();
    ({ reapExpiredHoldsForShowtime, reapAllExpiredHolds, releaseSeatsForHold } = await import(
      '../../src/jobs/holdReaper.js'
    ));
  });

  afterAll(async () => {
    await closeTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
    jest.clearAllMocks();
  });

  it('reaps an unpaid hold as soon as it is past plain expiry', async () => {
    const user = await seedHoldUser();
    const holdId = new mongoose.Types.ObjectId();
    const showtime = await seedShowtimeWithSeats([showtimeSeat({ status: 'held', holdRef: holdId })]);

    const hold = await Hold.create({
      _id: holdId,
      userRef: user._id,
      showtimeRef: showtime._id,
      seatIds: ['A-1'],
      seatSnapshot: [{ id: 'A-1', section: 'STANDARD', price: 1000 }],
      totalPrice: 1000,
      amountMinor: 1000,
      currency: 'LKR',
      status: 'active',
      expiresAt: new Date(Date.now() - 1000), // just past plain expiry
    });

    const released = await reapExpiredHoldsForShowtime(showtime._id.toString());
    expect(released).toBe(1);

    const updatedHold = await Hold.findById(hold._id);
    expect(updatedHold.status).toBe('released');

    const updatedShowtime = await Showtime.findById(showtime._id);
    const seat = updatedShowtime.seats.find((s) => s.id === 'A-1');
    expect(seat.status).toBe('available');
    expect(seat.holdRef).toBeUndefined();

    expect(socketMock.broadcastShowtimeSeatsUpdated).toHaveBeenCalledWith(
      showtime._id.toString(),
      ['A-1'],
      'available'
    );
  });

  it('does NOT reap a paid (paymentIntentId set) hold just past plain expiry — grace window applies', async () => {
    const user = await seedHoldUser();
    const holdId = new mongoose.Types.ObjectId();
    const showtime = await seedShowtimeWithSeats([showtimeSeat({ status: 'held', holdRef: holdId })]);

    await Hold.create({
      _id: holdId,
      userRef: user._id,
      showtimeRef: showtime._id,
      seatIds: ['A-1'],
      seatSnapshot: [{ id: 'A-1', section: 'STANDARD', price: 1000 }],
      totalPrice: 1000,
      amountMinor: 1000,
      currency: 'LKR',
      status: 'active',
      paymentIntentId: 'pi_grace_test',
      expiresAt: new Date(Date.now() - 1000), // just past plain expiry, well within grace
    });

    const released = await reapExpiredHoldsForShowtime(showtime._id.toString());
    expect(released).toBe(0);

    const stillActive = await Hold.findById(holdId);
    expect(stillActive.status).toBe('active');

    const untouchedShowtime = await Showtime.findById(showtime._id);
    expect(untouchedShowtime.seats.find((s) => s.id === 'A-1').status).toBe('held');
  });

  it('DOES reap a paid hold once past expiresAt + PAID_HOLD_GRACE_MS', async () => {
    const user = await seedHoldUser();
    const holdId = new mongoose.Types.ObjectId();
    const showtime = await seedShowtimeWithSeats([showtimeSeat({ status: 'held', holdRef: holdId })]);

    const graceMs = 5 * 60 * 1000;
    await Hold.create({
      _id: holdId,
      userRef: user._id,
      showtimeRef: showtime._id,
      seatIds: ['A-1'],
      seatSnapshot: [{ id: 'A-1', section: 'STANDARD', price: 1000 }],
      totalPrice: 1000,
      amountMinor: 1000,
      currency: 'LKR',
      status: 'active',
      paymentIntentId: 'pi_grace_test',
      expiresAt: new Date(Date.now() - (graceMs + 1000)), // past expiry + grace
    });

    const released = await reapExpiredHoldsForShowtime(showtime._id.toString());
    expect(released).toBe(1);

    const reapedHold = await Hold.findById(holdId);
    expect(reapedHold.status).toBe('released');
    expect(stripeMock.paymentIntents.cancel).toHaveBeenCalledWith('pi_grace_test');
  });

  it('reapAllExpiredHolds() sweeps across all showtimes, not just one', async () => {
    const user = await seedHoldUser();
    const holdId = new mongoose.Types.ObjectId();
    const showtime = await seedShowtimeWithSeats([showtimeSeat({ status: 'held', holdRef: holdId })]);

    await Hold.create({
      _id: holdId,
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

    const released = await reapAllExpiredHolds();
    expect(released).toBe(1);
  });

  it('holdRef-keyed release never steals back a seat re-held by a DIFFERENT hold (the exact bug this design avoids)', async () => {
    const user = await seedHoldUser();
    const hold1Id = new mongoose.Types.ObjectId();
    const showtime = await seedShowtimeWithSeats([showtimeSeat({ status: 'held', holdRef: hold1Id })]);

    // hold1: expired, already reaped once (simulated directly).
    const hold1 = await Hold.create({
      _id: hold1Id,
      userRef: user._id,
      showtimeRef: showtime._id,
      seatIds: ['A-1'],
      seatSnapshot: [{ id: 'A-1', section: 'STANDARD', price: 1000 }],
      totalPrice: 1000,
      amountMinor: 1000,
      currency: 'LKR',
      status: 'released',
      expiresAt: new Date(Date.now() - 60000),
    });

    // The seat has since been re-held by a brand new hold2.
    const hold2Id = new mongoose.Types.ObjectId();
    await Showtime.updateOne(
      { _id: showtime._id },
      {
        $set: {
          'seats.$[elem].status': 'held',
          'seats.$[elem].holdRef': hold2Id,
          'seats.$[elem].holdExpiresAt': new Date(Date.now() + 10 * 60 * 1000),
        },
      },
      { arrayFilters: [{ 'elem.id': 'A-1' }] }
    );

    // A stale/duplicate release attempt referencing hold1 fires late.
    await releaseSeatsForHold(hold1);

    // Seat A-1 must still belong to hold2 — untouched by hold1's stale release.
    const finalShowtime = await Showtime.findById(showtime._id);
    const seat = finalShowtime.seats.find((s) => s.id === 'A-1');
    expect(seat.status).toBe('held');
    expect(seat.holdRef.toString()).toBe(hold2Id.toString());
  });
});
