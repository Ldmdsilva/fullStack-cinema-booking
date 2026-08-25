import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import User from '../../src/models/User.js';

let app;
let getLastMail;

/**
 * Notifications are fire-and-forget (ADR-012) — the HTTP response returns
 * before the real `sendEmail` (nodemailer, jsonTransport in tests) actually
 * resolves, which is more than one microtask hop away. Poll with real
 * timers instead of guessing a fixed number of ticks. `excludeText` lets a
 * caller wait specifically for a *new* mail when the same recipient already
 * received an earlier one (e.g. verify, then later reset).
 */
async function waitForMail(email, { excludeText, timeoutMs = 2000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const mail = getLastMail(email);
    if (mail && mail.text !== excludeText) return mail;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for a new mail to ${email}`);
}

function extractToken(mail) {
  const match = mail.text.match(/token=([a-f0-9]+)/);
  return match ? match[1] : null;
}

/**
 * `generateToken`'s `iat` is deliberately set 1-2s ahead of the real clock
 * (see authService.js) so a token minted in the same wall-clock second as a
 * `revokeAllForUser` call is never mistaken for pre-dating it. The flip
 * side: revoking a token whose `iat` is that far into the future only
 * reliably catches it once at least that much real time has actually
 * passed. Real users never reset a password within ~1s of logging in, but a
 * fast automated test can — so wait it out explicitly rather than relying
 * on incidental step latency, to keep the D4.3(d) assertion deterministic.
 */
async function waitPastIatSkew() {
  // The lead is `ceil((now+1000)/1000)*1000 - now`, which can be just under
  // 2000ms, so wait comfortably past that worst case.
  await new Promise((resolve) => setTimeout(resolve, 2200));
}

describe('Auth flows — full HTTP surface (§C7.1 Authentication, D4.3(d))', () => {
  beforeAll(async () => {
    await connectTestDB();
    app = (await import('../../src/app.js')).default;
    ({ getLastMail } = await import('../../src/services/notification/emailService.js'));
  });

  afterAll(async () => {
    await closeTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  it('J1/J6-shaped journey: register -> verify -> login -> forgot -> reset -> old JWT revoked -> new JWT works', async () => {
    const email = 'journey@example.com';

    // 1. Register — 202, generic message, no token/user in body (D14).
    const registerRes = await request(app).post('/api/auth/register').send({
      name: 'Journey User',
      email,
      password: 'originalPassword1',
      phone: '0771234567',
    });
    expect(registerRes.status).toBe(202);
    expect(registerRes.body).toEqual({ message: expect.any(String) });
    expect(registerRes.body).not.toHaveProperty('token');

    const userAfterRegister = await User.findOne({ email });
    expect(userAfterRegister).toBeTruthy();
    expect(userAfterRegister.emailVerified).toBe(false);

    // 2. Capture the verify-email link the way a real user would (D13-style).
    const verifyMail = await waitForMail(email);
    const verifyToken = extractToken(verifyMail);
    expect(verifyToken).toBeTruthy();

    const verifyRes = await request(app).post('/api/auth/verify-email').send({ token: verifyToken });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body).toEqual({ verified: true });

    const userAfterVerify = await User.findOne({ email });
    expect(userAfterVerify.emailVerified).toBe(true);

    // Reusing the verify link now fails (single-use).
    const reuseVerifyRes = await request(app).post('/api/auth/verify-email').send({ token: verifyToken });
    expect(reuseVerifyRes.status).toBe(400);
    expect(reuseVerifyRes.body.error.code).toBe('TOKEN_USED');

    // 3. Login — the only place a JWT is issued (D14).
    const loginRes = await request(app).post('/api/auth/login').send({ email, password: 'originalPassword1' });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body).toHaveProperty('token');
    const oldToken = loginRes.body.token;

    const meRes = await request(app).get('/api/users/me').set('Authorization', `Bearer ${oldToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe(email);

    // Let enough real time pass since `oldToken` was minted that a
    // subsequent revocation is guaranteed to catch it (see waitPastIatSkew).
    await waitPastIatSkew();

    // 4. Forgot password — always 202, never leaks existence.
    const forgotRes = await request(app).post('/api/auth/forgot-password').send({ email });
    expect(forgotRes.status).toBe(202);
    expect(forgotRes.body).toEqual({ message: expect.any(String) });

    const resetMail = await waitForMail(email, { excludeText: verifyMail.text });
    const resetToken = extractToken(resetMail);
    expect(resetToken).toBeTruthy();
    expect(resetToken).not.toBe(verifyToken);

    // 5. Reset password.
    const resetRes = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: resetToken, password: 'brandNewPassword1' });
    expect(resetRes.status).toBe(200);

    // 6. D4.3(d): the JWT captured before the reset is now rejected.
    const revokedMeRes = await request(app).get('/api/users/me').set('Authorization', `Bearer ${oldToken}`);
    expect(revokedMeRes.status).toBe(401);
    expect(revokedMeRes.body.error.code).toBe('TOKEN_REVOKED');

    // Old password no longer works; new one does.
    const oldPasswordLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'originalPassword1' });
    expect(oldPasswordLoginRes.status).toBe(401);

    const freshLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'brandNewPassword1' });
    expect(freshLoginRes.status).toBe(200);
    const freshToken = freshLoginRes.body.token;
    expect(freshToken).not.toBe(oldToken);

    // 7. The freshly issued token works on the same protected route.
    const freshMeRes = await request(app).get('/api/users/me').set('Authorization', `Bearer ${freshToken}`);
    expect(freshMeRes.status).toBe(200);
    expect(freshMeRes.body.user.email).toBe(email);
  });

  describe('POST /api/auth/register', () => {
    it('responds identically for an already-registered email (FR-7)', async () => {
      const payload = {
        name: 'Original',
        email: 'dupe@example.com',
        password: 'password123',
        phone: '0771234567',
      };
      const first = await request(app).post('/api/auth/register').send(payload);
      const second = await request(app)
        .post('/api/auth/register')
        .send({ ...payload, name: 'Impostor', password: 'differentPw1' });

      expect(first.status).toBe(202);
      expect(second.status).toBe(202);
      expect(second.body).toEqual(first.body);

      const users = await User.find({ email: 'dupe@example.com' });
      expect(users).toHaveLength(1);
      expect(users[0].name).toBe('Original');
    });

    it('rejects a missing phone with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'No Phone', email: 'nophone@example.com', password: 'password123' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/auth/verify-email', () => {
    it('rejects an unknown token with 400 TOKEN_NOT_FOUND', async () => {
      const res = await request(app).post('/api/auth/verify-email').send({ token: 'not-a-real-token' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('TOKEN_NOT_FOUND');
    });
  });

  describe('POST /api/auth/resend-verification', () => {
    it('requires authentication', async () => {
      const res = await request(app).post('/api/auth/resend-verification').send({});
      expect(res.status).toBe(401);
    });

    it('issues a fresh verify-email link for the authenticated (unverified) caller — login does not require verification', async () => {
      const email = 'resend@example.com';
      await request(app).post('/api/auth/register').send({
        name: 'Resend User',
        email,
        password: 'password123',
        phone: '0771234567',
      });
      const firstMail = await waitForMail(email);
      const firstToken = extractToken(firstMail);

      // Login works even though the account is unverified (D14/ADR-011 §7).
      const loginRes = await request(app).post('/api/auth/login').send({ email, password: 'password123' });
      expect(loginRes.status).toBe(200);
      const token = loginRes.body.token;

      const resendRes = await request(app)
        .post('/api/auth/resend-verification')
        .set('Authorization', `Bearer ${token}`)
        .send();
      expect(resendRes.status).toBe(202);
      expect(resendRes.body).toEqual({ message: expect.any(String) });

      const secondMail = await waitForMail(email, { excludeText: firstMail.text });
      const secondToken = extractToken(secondMail);
      expect(secondToken).toBeTruthy();
      expect(secondToken).not.toBe(firstToken);

      // The original link is no longer valid; the resent one is.
      const oldRes = await request(app).post('/api/auth/verify-email').send({ token: firstToken });
      expect(oldRes.status).toBe(400);

      const newRes = await request(app).post('/api/auth/verify-email').send({ token: secondToken });
      expect(newRes.status).toBe(200);
      expect(newRes.body).toEqual({ verified: true });
    });
  });

  describe('POST /api/auth/login', () => {
    it('rejects an unknown email and a wrong password with the same 401 INVALID_CREDENTIALS', async () => {
      await request(app).post('/api/auth/register').send({
        name: 'Login User',
        email: 'loginuser@example.com',
        password: 'correctPassword1',
        phone: '0771234567',
      });

      const unknownRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nosuchuser@example.com', password: 'whatever1' });
      const wrongPwRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'loginuser@example.com', password: 'wrongPassword1' });

      expect(unknownRes.status).toBe(401);
      expect(wrongPwRes.status).toBe(401);
      expect(unknownRes.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(wrongPwRes.body.error.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('POST /api/auth/forgot-password', () => {
    it('returns 202 for a non-existent email too (no enumeration)', async () => {
      const res = await request(app).post('/api/auth/forgot-password').send({ email: 'ghost@example.com' });
      expect(res.status).toBe(202);
      expect(res.body).toEqual({ message: expect.any(String) });
    });
  });

  describe('POST /api/auth/reset-password', () => {
    it('rejects an unknown token with 400 TOKEN_NOT_FOUND', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'not-a-real-token', password: 'somePassword1' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('TOKEN_NOT_FOUND');
    });

    it('rejects a password shorter than 6 characters with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'irrelevant-because-validation-runs-first', password: '123' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
