import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import { authLimiter, bookingLimiter } from '../../src/middleware/rateLimiter.js';
import { AppError } from '../../src/middleware/errorHandler.js';
import RateCounter from '../../src/models/RateCounter.js';
import { env } from '../../src/config/env.js';

function mockReqRes(ip) {
  return { req: { ip }, res: {} };
}

describe('rateLimiter middleware — Mongo-backed fixed window (ADR-013 Option D / D5)', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  it('confirms tests run under the NODE_ENV=test ceiling this suite assumes (authLimiter max 1000, bookingLimiter max 10000)', () => {
    expect(env.NODE_ENV).toBe('test');
  });

  it('allows a request through on a fresh key and calls next() with no argument', async () => {
    const { req, res } = mockReqRes('10.0.0.1');
    const next = jest.fn();

    await authLimiter(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();

    const counter = await RateCounter.findOne({ key: 'authLimiter:10.0.0.1' });
    expect(counter).not.toBeNull();
    expect(counter.count).toBe(1);
  });

  it('allows a request through when one below the test-env ceiling (999 -> 1000 for authLimiter)', async () => {
    await RateCounter.create({
      key: 'authLimiter:10.0.0.2',
      count: 999,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });

    const { req, res } = mockReqRes('10.0.0.2');
    const next = jest.fn();

    await authLimiter(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('rejects with next(AppError) statusCode 429 / code RATE_LIMITED once count exceeds the test-env max', async () => {
    await RateCounter.create({
      key: 'authLimiter:10.0.0.3',
      count: 1000, // already at the NODE_ENV=test ceiling for authLimiter
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });

    const { req, res } = mockReqRes('10.0.0.3');
    const next = jest.fn();

    await authLimiter(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const errArg = next.mock.calls[0][0];
    expect(errArg).toBeInstanceOf(AppError);
    expect(errArg.statusCode).toBe(429);
    expect(errArg.code).toBe('RATE_LIMITED');
  });

  it('applies the higher bookingLimiter ceiling independently (10000), keyed separately from authLimiter', async () => {
    const ip = '10.0.0.4';
    const next = jest.fn();

    await authLimiter({ ip }, {}, next);
    await bookingLimiter({ ip }, {}, next);

    const authCounter = await RateCounter.findOne({ key: `authLimiter:${ip}` });
    const bookingCounter = await RateCounter.findOne({ key: `bookingLimiter:${ip}` });

    expect(authCounter.count).toBe(1);
    expect(bookingCounter.count).toBe(1);

    // bookingLimiter would still be well under its 10000 ceiling here even
    // though authLimiter's 1000 ceiling would already be exceeded at this
    // count, confirming the two limiters carry distinct max values.
    await RateCounter.updateOne({ key: `bookingLimiter:${ip}` }, { $set: { count: 1000 } });
    const bookingNext = jest.fn();
    await bookingLimiter({ ip }, {}, bookingNext);
    expect(bookingNext).toHaveBeenCalledWith();
  });

  it('starts a fresh window once the previous one has expired, instead of continuing to reject', async () => {
    await RateCounter.create({
      key: 'authLimiter:10.0.0.5',
      count: 1000,
      expiresAt: new Date(Date.now() - 1000), // already expired
    });

    const { req, res } = mockReqRes('10.0.0.5');
    const next = jest.fn();

    await authLimiter(req, res, next);

    expect(next).toHaveBeenCalledWith();
    const counter = await RateCounter.findOne({ key: 'authLimiter:10.0.0.5' });
    expect(counter.count).toBe(1);
    expect(counter.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('retries the increment once when it loses the race to create a fresh window (duplicate key on upsert)', async () => {
    const findOneAndUpdateSpy = jest.spyOn(RateCounter, 'findOneAndUpdate');
    let call = 0;
    findOneAndUpdateSpy.mockImplementation(async () => {
      call += 1;
      if (call === 1) return null; // no live window found yet
      if (call === 2) {
        // A concurrent request created the window first.
        const duplicateError = new Error('E11000 duplicate key error');
        duplicateError.code = 11000;
        throw duplicateError;
      }
      return { count: 1 }; // retry succeeds against the window "someone else" created
    });

    const { req, res } = mockReqRes('10.0.0.6');
    const next = jest.fn();

    await authLimiter(req, res, next);

    expect(call).toBe(3);
    expect(next).toHaveBeenCalledWith();

    findOneAndUpdateSpy.mockRestore();
  });

  it('fails open (calls next() with no error) if the post-race retry also returns null', async () => {
    const findOneAndUpdateSpy = jest.spyOn(RateCounter, 'findOneAndUpdate');
    let call = 0;
    findOneAndUpdateSpy.mockImplementation(async () => {
      call += 1;
      if (call === 2) {
        const duplicateError = new Error('E11000 duplicate key error');
        duplicateError.code = 11000;
        throw duplicateError;
      }
      return null;
    });

    const { req, res } = mockReqRes('10.0.0.7');
    const next = jest.fn();

    await authLimiter(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();

    findOneAndUpdateSpy.mockRestore();
  });

  it('fails open (calls next() with no error) rather than 500ing on an unexpected DB error', async () => {
    const findOneAndUpdateSpy = jest.spyOn(RateCounter, 'findOneAndUpdate');
    findOneAndUpdateSpy.mockImplementation(async () => {
      throw new Error('unexpected connection error');
    });

    const { req, res } = mockReqRes('10.0.0.8');
    const next = jest.fn();

    await authLimiter(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();

    findOneAndUpdateSpy.mockRestore();
  });
});
