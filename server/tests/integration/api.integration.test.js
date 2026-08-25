import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import { createStripeMock, mockStripeModule } from '../helpers/mocks.js';
import User from '../../src/models/User.js';

// Stripe must be mocked before app.js is dynamically imported below, since
// app.js -> bookingRoutes -> bookingService/paymentService -> config/stripe.js
// -> 'stripe'. POST /api/bookings is exercised repeatedly in this suite and
// must never hit the real Stripe API.
const stripeMock = createStripeMock();
mockStripeModule(stripeMock);

let app;
let authService;

describe('Encore REST API Integration Tests (§C7.1, §D4.2, ADR-008)', () => {
  beforeAll(async () => {
    await connectTestDB();
    app = (await import('../../src/app.js')).default;
    authService = await import('../../src/services/authService.js');
  });

  afterAll(async () => {
    await closeTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  describe('Health Check Endpoint (NFR-7, §C7.1)', () => {
    it('GET /api/health returns 200 and healthy db status', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'healthy');
      expect(res.body).toHaveProperty('db', 'connected');
    });
  });

  describe('Authentication Endpoints (FR-1, FR-2, FR-3, FR-4)', () => {
    it('POST /api/auth/register returns 202 with a generic message and no token (D14)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Sarah Connor',
          email: 'sarah@example.com',
          password: 'securePassword99',
          phone: '0771234567',
        });

      expect(res.status).toBe(202);
      expect(res.body).toHaveProperty('message');
      expect(res.body).not.toHaveProperty('token');
      expect(res.body).not.toHaveProperty('user');

      const created = await User.findOne({ email: 'sarah@example.com' });
      expect(created).toBeTruthy();
      expect(created.emailVerified).toBe(false);
    });

    it('POST /api/auth/register responds identically for an already-registered email (FR-7, no enumeration)', async () => {
      const payload = {
        name: 'Sarah Connor',
        email: 'sarahdup@example.com',
        password: 'securePassword99',
        phone: '0771234567',
      };

      const first = await request(app).post('/api/auth/register').send(payload);
      const second = await request(app)
        .post('/api/auth/register')
        .send({ ...payload, name: 'Someone Else', password: 'differentPassword1' });

      expect(second.status).toBe(202);
      expect(second.body).toEqual(first.body);

      const users = await User.find({ email: 'sarahdup@example.com' });
      expect(users).toHaveLength(1);
      expect(users[0].name).toBe('Sarah Connor');
    });

    it('POST /api/auth/register rejects a missing phone (400 VALIDATION_ERROR)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'No Phone',
          email: 'nophone@example.com',
          password: 'securePassword99',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('POST /api/auth/login logs in user and returns 200 with JWT', async () => {
      await authService.register({
        name: 'Sarah Connor',
        email: 'sarah@example.com',
        password: 'securePassword99',
        phone: '0771234567',
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'sarah@example.com',
          password: 'securePassword99',
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
    });

    it('GET /api/users/me returns 401 when token is missing (FR-3)', async () => {
      const res = await request(app).get('/api/users/me');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('GET /api/users/me returns 401 when the Authorization header is not a Bearer token (FR-3)', async () => {
      const res = await request(app).get('/api/users/me').set('Authorization', 'Basic somecredentials');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('GET /api/users/me returns 401 INVALID_TOKEN for a garbage/malformed token (ADR-005)', async () => {
      const res = await request(app).get('/api/users/me').set('Authorization', 'Bearer not-a-real-jwt');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });

    it('GET /api/users/me returns 401 TOKEN_EXPIRED for an expired token (ADR-005)', async () => {
      const expiredToken = jwt.sign({ id: 'someid', email: 'x@example.com', role: 'customer' }, process.env.JWT_SECRET, {
        expiresIn: -10, // already expired
      });

      const res = await request(app).get('/api/users/me').set('Authorization', `Bearer ${expiredToken}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('TOKEN_EXPIRED');
    });

    it('GET /api/users/me returns 200 with profile when valid token provided (FR-5)', async () => {
      await authService.register({
        name: 'Sarah Connor',
        email: 'sarah@example.com',
        password: 'securePassword99',
        phone: '0771234567',
      });
      // register() no longer issues a JWT (D14) — login is the only token
      // issuer, and it doesn't require email verification first.
      const { token } = await authService.login({ email: 'sarah@example.com', password: 'securePassword99' });

      const res = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('sarah@example.com');
      expect(res.body.user).toHaveProperty('id');
    });
  });

  // The old Event/Venue-based "Events and Booking Lifecycle" describe block
  // (FR-7, FR-8, FR-17, FR-18, FR-19) was removed here: the Event/Venue
  // domain has been retired (§P6) and its booking assertions exercised the
  // pre-migration `eventId`-based POST /api/bookings contract, which the
  // parallel Showtime/Hold booking migration supersedes. Equivalent coverage
  // for the new flow lives in confirmBooking.idempotency.test.js,
  // holdRoutes.test.js, and showtimeRoutes.test.js.
});
