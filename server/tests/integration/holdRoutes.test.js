import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import { createStripeMock, mockStripeModule } from '../helpers/mocks.js';
import User from '../../src/models/User.js';
import Showtime from '../../src/models/Showtime.js';
import Hold from '../../src/models/Hold.js';

// Stripe must be mocked before the dynamic import of app.js below — the
// payment-intent endpoint calls paymentService.createIntent/cancelIntent,
// which go through the real (mocked) Stripe client.
const stripeMock = createStripeMock();
mockStripeModule(stripeMock);

let app;

function seat(overrides = {}) {
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

async function createShowtimeWithSeats(seats) {
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

async function createUserAndLogin({ emailVerified = true, role = 'customer' } = {}) {
  const password = 'Password123!';
  const passwordHash = await bcrypt.hash(password, 10);
  const email = `holdroutes-${Math.random().toString(36).slice(2)}@test.com`;
  const user = await User.create({
    name: 'Hold Routes User',
    email,
    passwordHash,
    phone: `9477${Math.floor(1000000 + Math.random() * 8999999)}`,
    role,
    emailVerified,
  });
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return { user, token: res.body.token };
}

async function createHoldViaApi(token, showtime, seatIds = ['A-1']) {
  const res = await request(app)
    .post('/api/holds')
    .set('Authorization', `Bearer ${token}`)
    .send({ showtimeId: showtime._id.toString(), seatIds });
  return res;
}

describe('Hold routes — /api/holds (§C7.1, D6, D12)', () => {
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

  describe('POST /api/holds', () => {
    it('returns 401 with no token', async () => {
      const showtime = await createShowtimeWithSeats([seat()]);
      const res = await request(app)
        .post('/api/holds')
        .send({ showtimeId: showtime._id.toString(), seatIds: ['A-1'] });
      expect(res.status).toBe(401);
    });

    it('returns 403 EMAIL_NOT_VERIFIED for an unverified customer', async () => {
      const showtime = await createShowtimeWithSeats([seat()]);
      const { token } = await createUserAndLogin({ emailVerified: false });

      const res = await createHoldViaApi(token, showtime);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    });

    it('returns 400 VALIDATION_ERROR for an unexpected field (zod .strict())', async () => {
      const showtime = await createShowtimeWithSeats([seat()]);
      const { token } = await createUserAndLogin();

      const res = await request(app)
        .post('/api/holds')
        .set('Authorization', `Bearer ${token}`)
        .send({ showtimeId: showtime._id.toString(), seatIds: ['A-1'], amount: 1 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('creates a hold and returns 201 {holdId, expiresAt, amountMinor, currency}', async () => {
      const showtime = await createShowtimeWithSeats([seat()]);
      const { token } = await createUserAndLogin();

      const res = await createHoldViaApi(token, showtime);

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ amountMinor: 1000, currency: 'LKR' });
      expect(res.body.holdId).toBeDefined();
      expect(res.body.expiresAt).toBeDefined();

      const stored = await Hold.findById(res.body.holdId);
      expect(stored.status).toBe('active');

      const updatedShowtime = await Showtime.findById(showtime._id);
      expect(updatedShowtime.seats[0].status).toBe('held');
    });

    it('returns 409 SEAT_UNAVAILABLE when the seat is already held', async () => {
      const showtime = await createShowtimeWithSeats([seat({ status: 'held' })]);
      const { token } = await createUserAndLogin();

      const res = await createHoldViaApi(token, showtime);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('SEAT_UNAVAILABLE');
    });

    it('returns 404 SHOWTIME_NOT_FOUND for a bogus showtimeId', async () => {
      const { token } = await createUserAndLogin();
      const res = await request(app)
        .post('/api/holds')
        .set('Authorization', `Bearer ${token}`)
        .send({ showtimeId: new mongoose.Types.ObjectId().toString(), seatIds: ['A-1'] });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('SHOWTIME_NOT_FOUND');
    });
  });

  describe('GET /api/holds/:id', () => {
    it('returns 200 for the hold owner', async () => {
      const showtime = await createShowtimeWithSeats([seat()]);
      const { token } = await createUserAndLogin();
      const created = await createHoldViaApi(token, showtime);

      const res = await request(app)
        .get(`/api/holds/${created.body.holdId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.holdId).toBe(created.body.holdId);
      expect(res.body.status).toBe('active');
    });

    it('returns 403 for a different, non-owning customer', async () => {
      const showtime = await createShowtimeWithSeats([seat()]);
      const { token: ownerToken } = await createUserAndLogin();
      const created = await createHoldViaApi(ownerToken, showtime);

      const { token: otherToken } = await createUserAndLogin();
      const res = await request(app)
        .get(`/api/holds/${created.body.holdId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(403);
    });

    it('returns 404 HOLD_NOT_FOUND for a bogus id', async () => {
      const { token } = await createUserAndLogin();
      const res = await request(app)
        .get(`/api/holds/${new mongoose.Types.ObjectId().toString()}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('HOLD_NOT_FOUND');
    });
  });

  describe('full lifecycle: create -> payment-intent -> release', () => {
    it('creates a PaymentIntent, then releases the hold, freeing the seat and cancelling the intent', async () => {
      const showtime = await createShowtimeWithSeats([seat()]);
      const { token } = await createUserAndLogin();

      const created = await createHoldViaApi(token, showtime);
      expect(created.status).toBe(201);

      const intentRes = await request(app)
        .post(`/api/holds/${created.body.holdId}/payment-intent`)
        .set('Authorization', `Bearer ${token}`);

      expect(intentRes.status).toBe(201);
      expect(intentRes.body.clientSecret).toBeDefined();
      expect(intentRes.body.publishableKey).toBeDefined();
      expect(stripeMock.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 1000, currency: 'LKR' }),
        { idempotencyKey: created.body.holdId }
      );

      const holdWithIntent = await Hold.findById(created.body.holdId);
      expect(holdWithIntent.paymentIntentId).toBeDefined();

      const releaseRes = await request(app)
        .delete(`/api/holds/${created.body.holdId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(releaseRes.status).toBe(204);
      expect(stripeMock.paymentIntents.cancel).toHaveBeenCalledWith(holdWithIntent.paymentIntentId);

      const finalShowtime = await Showtime.findById(showtime._id);
      expect(finalShowtime.seats[0].status).toBe('available');
      expect(finalShowtime.seats[0].holdRef).toBeUndefined();

      const finalHold = await Hold.findById(created.body.holdId);
      expect(finalHold.status).toBe('released');

      // Idempotent: releasing again does not error.
      const secondRelease = await request(app)
        .delete(`/api/holds/${created.body.holdId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(secondRelease.status).toBe(204);
    });
  });

  describe('POST /api/holds/:id/payment-intent — error paths', () => {
    it('returns 404 HOLD_NOT_FOUND for a bogus id', async () => {
      const { token } = await createUserAndLogin();
      const res = await request(app)
        .post(`/api/holds/${new mongoose.Types.ObjectId().toString()}/payment-intent`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('HOLD_NOT_FOUND');
    });

    it('returns 403 for a non-owner', async () => {
      const showtime = await createShowtimeWithSeats([seat()]);
      const { token: ownerToken } = await createUserAndLogin();
      const created = await createHoldViaApi(ownerToken, showtime);

      const { token: otherToken } = await createUserAndLogin();
      const res = await request(app)
        .post(`/api/holds/${created.body.holdId}/payment-intent`)
        .set('Authorization', `Bearer ${otherToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /api/holds/:id', () => {
    it('returns 401 with no token', async () => {
      const showtime = await createShowtimeWithSeats([seat()]);
      const { token } = await createUserAndLogin();
      const created = await createHoldViaApi(token, showtime);

      const res = await request(app).delete(`/api/holds/${created.body.holdId}`);
      expect(res.status).toBe(401);
    });

    it('returns 404 HOLD_NOT_FOUND for a bogus id', async () => {
      const { token } = await createUserAndLogin();
      const res = await request(app)
        .delete(`/api/holds/${new mongoose.Types.ObjectId().toString()}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('HOLD_NOT_FOUND');
    });
  });
});
