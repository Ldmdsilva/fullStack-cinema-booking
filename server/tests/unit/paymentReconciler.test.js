import { describe, it, expect, beforeAll, beforeEach, afterAll, jest } from '@jest/globals';
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import { createStripeMock, mockStripeModule } from '../helpers/mocks.js';

// Stripe must be mocked before the dynamic import of paymentReconciler.js
// (and holdService.js, used by the test fixtures) below.
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

let paymentReconciler;
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
    title: 'Reconciler Test Film',
    synopsis: 'A synopsis.',
    certificate: 'PG',
    runtimeMinutes: 100,
    genre: ['Drama'],
    releaseDate: new Date(Date.now() - 86400000),
  });
  const cinema = await Cinema.create({
    name: 'Reconciler Test Cinema',
    address: '1 Reconciler Ave',
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

async function createUser() {
  return User.create({
    name: 'Abandoned Tab Customer',
    email: `abandoned${Math.random().toString(36).slice(2)}@test.com`,
    passwordHash: 'hash',
    phone: `9477${Math.floor(1000000 + Math.random() * 8999999)}`,
    role: 'customer',
    emailVerified: true,
  });
}

/**
 * The abandoned-tab scenario (§D4.3(b)(ii), J3): a hold with a payment
 * attempt, never confirmed via the HTTP endpoint at all.
 */
async function createUnconfirmedPaidHold({ paymentIntentId = 'pi_test_reconcile' } = {}) {
  const { film, cinema } = await createFilmAndCinema();
  const showtime = await Showtime.create({
    filmRef: film._id,
    cinemaRef: cinema._id,
    screenId: '1',
    screenName: 'Screen 1',
    startsAt: new Date(Date.now() + 86400000),
    basePrice: 1000,
    status: 'scheduled',
    seats: [showtimeSeat()],
  });
  const user = await createUser();

  const hold = await holdService.createHold({
    userId: user._id.toString(),
    showtimeId: showtime._id.toString(),
    seatIds: ['A-1'],
  });
  await Hold.updateOne({ _id: hold._id }, { $set: { paymentIntentId } });

  return { hold: await Hold.findById(hold._id), showtime, user };
}

describe('jobs/paymentReconciler.js (FR-39, ADR-014, §D4.3(b)(ii))', () => {
  beforeAll(async () => {
    await connectTestDB();
    paymentReconciler = await import('../../src/jobs/paymentReconciler.js');
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

  it('completes an abandoned-tab hold: booking created, seats booked, booking:confirmed emitted, confirmation dispatched — never having called confirm at all', async () => {
    const { hold, showtime, user } = await createUnconfirmedPaidHold();

    stripeMock.paymentIntents.retrieve.mockResolvedValueOnce({
      id: hold.paymentIntentId,
      status: 'succeeded',
      amount: hold.amountMinor,
      currency: hold.currency.toLowerCase(),
      metadata: { holdId: hold._id.toString() },
    });

    const reconciledCount = await paymentReconciler.reconcilePendingHolds();

    expect(reconciledCount).toBe(1);
    expect(await Booking.countDocuments({})).toBe(1);

    const booking = await Booking.findOne({ holdRef: hold._id });
    expect(booking).not.toBeNull();
    expect(booking.status).toBe('confirmed');
    expect(booking.paymentStatus).toBe('succeeded');

    const updatedShowtime = await Showtime.findById(showtime._id);
    expect(updatedShowtime.seats[0].status).toBe('booked');

    const updatedHold = await Hold.findById(hold._id);
    expect(updatedHold.status).toBe('consumed');

    expect(socketMock.broadcastBookingConfirmed).toHaveBeenCalledWith(user._id.toString(), {
      holdId: hold._id.toString(),
      bookingId: booking._id.toString(),
      reference: booking.reference,
    });
    expect(notificationMock.notifyBookingConfirmed).toHaveBeenCalledTimes(1);
  });

  it('running a second sweep does not create a second booking — the now-consumed hold is excluded from candidates', async () => {
    const { hold } = await createUnconfirmedPaidHold();

    stripeMock.paymentIntents.retrieve.mockResolvedValue({
      id: hold.paymentIntentId,
      status: 'succeeded',
      amount: hold.amountMinor,
      currency: hold.currency.toLowerCase(),
      metadata: { holdId: hold._id.toString() },
    });

    const firstSweep = await paymentReconciler.reconcilePendingHolds();
    expect(firstSweep).toBe(1);

    jest.clearAllMocks();

    const secondSweep = await paymentReconciler.reconcilePendingHolds();
    expect(secondSweep).toBe(0);
    expect(stripeMock.paymentIntents.retrieve).not.toHaveBeenCalled();

    expect(await Booking.countDocuments({})).toBe(1);
  });

  it('leaves a not-yet-succeeded hold alone and continues past a failing candidate without aborting the sweep', async () => {
    const { hold: pendingHold } = await createUnconfirmedPaidHold({ paymentIntentId: 'pi_still_pending' });
    const { hold: failingHold } = await createUnconfirmedPaidHold({ paymentIntentId: 'pi_will_throw' });

    stripeMock.paymentIntents.retrieve.mockImplementation(async (id) => {
      if (id === 'pi_still_pending') {
        return { id, status: 'requires_payment_method', amount: pendingHold.amountMinor, currency: 'lkr', metadata: {} };
      }
      throw new Error('Stripe unreachable');
    });

    const reconciledCount = await paymentReconciler.reconcilePendingHolds();

    expect(reconciledCount).toBe(0);
    expect(await Booking.countDocuments({})).toBe(0);

    const stillActivePending = await Hold.findById(pendingHold._id);
    expect(stillActivePending.status).toBe('active');
    const stillActiveFailing = await Hold.findById(failingHold._id);
    expect(stillActiveFailing.status).toBe('active');
  });
});
