import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, jest } from '@jest/globals';
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import { createStripeMock, mockStripeModule } from '../helpers/mocks.js';
import Hold from '../../src/models/Hold.js';
import { logger } from '../../src/config/logger.js';

// Stripe must be mocked before the dynamic import of paymentReconciler.js
// below (its reconcile sweep calls paymentService.retrieveIntent).
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

describe('jobs/paymentReconciler.js — start/stop lifecycle (FR-39)', () => {
  beforeAll(async () => {
    // A real (in-memory) DB connection so the interval callback's
    // Hold.find(...) resolves instead of buffering forever against a
    // never-connected mongoose instance.
    await connectTestDB();
    paymentReconciler = await import('../../src/jobs/paymentReconciler.js');
  });

  afterAll(async () => {
    await closeTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Guard against a real interval leaking into a later test/file if a
    // test below fails before reaching its own stopPaymentReconciler() call.
    paymentReconciler.stopPaymentReconciler();
  });

  it('startPaymentReconciler registers a repeating 2-minute sweep and is idempotent while already running', () => {
    const setIntervalSpy = jest.spyOn(global, 'setInterval').mockImplementation(() => 'fake-handle-1');

    const handle1 = paymentReconciler.startPaymentReconciler();
    expect(handle1).toBe('fake-handle-1');
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 2 * 60 * 1000);

    // Calling start again while already running must NOT register a second
    // interval — it just hands back the existing handle.
    const handle2 = paymentReconciler.startPaymentReconciler();
    expect(handle2).toBe(handle1);
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    setIntervalSpy.mockRestore();
  });

  it('the scheduled callback invokes a reconciliation sweep exactly the way production\'s 2-minute timer would', async () => {
    let scheduledFn;
    const setIntervalSpy = jest.spyOn(global, 'setInterval').mockImplementation((fn) => {
      scheduledFn = fn;
      return 'fake-handle-2';
    });

    paymentReconciler.startPaymentReconciler();
    expect(typeof scheduledFn).toBe('function');

    // With zero candidate holds this resolves cleanly — exercising the
    // actual scheduled path (interval callback -> reconcilePendingHolds()
    // -> .catch(...)), not just a direct unit call to reconcilePendingHolds.
    expect(() => scheduledFn()).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 20));

    setIntervalSpy.mockRestore();
  });

  it('stopPaymentReconciler clears a running interval, and is a safe no-op when nothing is running', () => {
    const setIntervalSpy = jest.spyOn(global, 'setInterval').mockImplementation(() => 'fake-handle-3');
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval').mockImplementation(() => {});

    paymentReconciler.startPaymentReconciler();
    paymentReconciler.stopPaymentReconciler();
    expect(clearIntervalSpy).toHaveBeenCalledWith('fake-handle-3');
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);

    // Calling stop again (nothing running) must not call clearInterval again.
    paymentReconciler.stopPaymentReconciler();
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);

    // And a start after a stop registers a brand new interval, proving the
    // guard was actually reset to null rather than left stale.
    const handle = paymentReconciler.startPaymentReconciler();
    expect(handle).toBe('fake-handle-3');
    expect(setIntervalSpy).toHaveBeenCalledTimes(2);

    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });

  it('stopPaymentReconciler with nothing ever started is a safe no-op', () => {
    expect(() => paymentReconciler.stopPaymentReconciler()).not.toThrow();
  });

  it('the scheduled callback logs (and swallows) a sweep-level failure instead of crashing the process', async () => {
    let scheduledFn;
    const setIntervalSpy = jest.spyOn(global, 'setInterval').mockImplementation((fn) => {
      scheduledFn = fn;
      return 'fake-handle-4';
    });
    // reconcilePendingHolds()'s own per-hold try/catch already swallows a
    // single Stripe failure without rejecting — the only way its outer
    // promise itself rejects is a failure in the initial Hold.find(...), so
    // that's what's forced here to reach the interval callback's OWN
    // `.catch(...)` (distinct from reconcilePendingHolds's internal one).
    const findSpy = jest.spyOn(Hold, 'find').mockImplementationOnce(() => {
      throw new Error('Hold.find exploded');
    });
    const loggerSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});

    paymentReconciler.startPaymentReconciler();
    expect(() => scheduledFn()).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(loggerSpy).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      '[PaymentReconciler] Sweep failed'
    );

    findSpy.mockRestore();
    loggerSpy.mockRestore();
    setIntervalSpy.mockRestore();
  });
});
