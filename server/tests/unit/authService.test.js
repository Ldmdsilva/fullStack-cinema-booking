import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import * as authService from '../../src/services/authService.js';
import * as tokenService from '../../src/services/tokenService.js';
import * as tokenDenylistService from '../../src/services/tokenDenylistService.js';
import User from '../../src/models/User.js';
import AuthToken from '../../src/models/AuthToken.js';

describe('authService Unit Tests (§D4.1)', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  describe('generateToken', () => {
    it('signs a token whose iat is a whole-second timestamp ~1-2s ahead of "now" (revocation-race fix)', async () => {
      const before = Date.now();
      const user = await User.create({
        name: 'Token User',
        email: 'tokenuser@example.com',
        passwordHash: 'irrelevant-hash',
        phone: '94771234567',
        role: 'customer',
      });

      const token = authService.generateToken(user);
      const decoded = jwt.decode(token);

      expect(Number.isInteger(decoded.iat)).toBe(true);
      // iat must be a whole number of seconds, strictly ahead of the moment
      // generateToken() was called, and within a couple of seconds of it —
      // not an arbitrary time in the future.
      const iatMs = decoded.iat * 1000;
      expect(iatMs).toBeGreaterThan(before);
      expect(iatMs).toBeLessThanOrEqual(before + 2000);
      expect(decoded.id).toBe(user._id.toString());
      expect(decoded.email).toBe(user.email);
      expect(decoded.role).toBe(user.role);
    });
  });

  describe('register (FR-1, D14, FR-7)', () => {
    it('creates an unverified user, issues a hashed verify_email token, and responds 202 with a generic message and no token/user', async () => {
      const result = await authService.register({
        name: 'John Fan',
        email: 'john@example.com',
        password: 'password123',
        phone: '0771234567',
      });

      expect(result).toEqual({ message: expect.any(String) });
      expect(result).not.toHaveProperty('token');
      expect(result).not.toHaveProperty('user');

      const user = await User.findOne({ email: 'john@example.com' }).select('+passwordHash');
      expect(user).toBeTruthy();
      expect(user.name).toBe('John Fan');
      expect(user.role).toBe('customer');
      expect(user.phone).toBe('94771234567'); // normalised for notify.lk
      expect(user.emailVerified).toBe(false);

      // Password stored hashed (NFR-3)
      expect(user.passwordHash).not.toBe('password123');
      expect(user.passwordHash.startsWith('$2')).toBe(true);

      // A verify_email AuthToken was issued for this user, hashed at rest
      // (a 64-char hex SHA-256 digest, never the raw token).
      const authToken = await AuthToken.findOne({ userRef: user._id, kind: 'verify_email' });
      expect(authToken).toBeTruthy();
      expect(authToken.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(authToken.usedAt).toBeNull();
    });

    it('FR-7/NFR-7: responds identically for an already-registered email — no 409, no enumeration, no duplicate user created', async () => {
      const first = await authService.register({
        name: 'User One',
        email: 'duplicate@example.com',
        password: 'password123',
        phone: '0771234567',
      });

      const second = await authService.register({
        name: 'User Two',
        email: 'duplicate@example.com',
        password: 'password456',
        phone: '0777654321',
      });

      expect(second).toEqual(first);

      const users = await User.find({ email: 'duplicate@example.com' });
      expect(users).toHaveLength(1);
      expect(users[0].name).toBe('User One'); // original account untouched
    });

    it('rejects registration with a missing phone (400 VALIDATION_ERROR)', async () => {
      await expect(
        authService.register({
          name: 'No Phone',
          email: 'nophone@example.com',
          password: 'password123',
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('rejects registration with an invalid/unnormalisable phone (400 VALIDATION_ERROR)', async () => {
      await expect(
        authService.register({
          name: 'Bad Phone',
          email: 'badphone@example.com',
          password: 'password123',
          phone: '12345', // too short to be a valid LK mobile number
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('rejects a password shorter than 6 characters (400 VALIDATION_ERROR)', async () => {
      await expect(
        authService.register({ name: 'Short Pw', email: 'shortpw@example.com', password: '123', phone: '0771234567' })
      ).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    });
  });

  describe('verifyEmail', () => {
    it('marks the user verified and consumes the token (single-use)', async () => {
      await authService.register({
        name: 'Verify Me',
        email: 'verifyme@example.com',
        password: 'password123',
        phone: '0771234567',
      });

      const user = await User.findOne({ email: 'verifyme@example.com' });

      // Reissue a token via tokenService directly to get the raw value
      // (register() only ever hands the raw token to the notification
      // layer, never back to the caller).
      await AuthToken.deleteMany({ userRef: user._id, kind: 'verify_email' });
      const { token: rawToken } = await tokenService.issueToken(user._id, 'verify_email', 60 * 60 * 1000);

      const result = await authService.verifyEmail({ token: rawToken });
      expect(result).toEqual({ verified: true });

      const verifiedUser = await User.findById(user._id);
      expect(verifiedUser.emailVerified).toBe(true);

      // Single-use: reusing the same token now fails.
      await expect(authService.verifyEmail({ token: rawToken })).rejects.toMatchObject({
        statusCode: 400,
        code: 'TOKEN_USED',
      });
    });

    it('rejects an unknown/garbage token with 400 TOKEN_NOT_FOUND', async () => {
      await expect(authService.verifyEmail({ token: 'not-a-real-token' })).rejects.toMatchObject({
        statusCode: 400,
        code: 'TOKEN_NOT_FOUND',
      });
    });

    it('rejects an expired token with 400 TOKEN_NOT_FOUND', async () => {
      const user = await User.create({
        name: 'Expired Verify',
        email: 'expiredverify@example.com',
        passwordHash: 'hash',
        phone: '94771234567',
      });
      const { token: rawToken } = await tokenService.issueToken(user._id, 'verify_email', -1000); // already expired

      await expect(authService.verifyEmail({ token: rawToken })).rejects.toMatchObject({
        statusCode: 400,
        code: 'TOKEN_NOT_FOUND',
      });
    });
  });

  describe('resendVerification', () => {
    it('issues a fresh verify_email token and invalidates the old one for an unverified user', async () => {
      await authService.register({
        name: 'Resend Me',
        email: 'resendme@example.com',
        password: 'password123',
        phone: '0771234567',
      });
      const user = await User.findOne({ email: 'resendme@example.com' });
      const originalToken = await AuthToken.findOne({ userRef: user._id, kind: 'verify_email' });

      const result = await authService.resendVerification({ userId: user._id.toString() });
      expect(result).toEqual({ message: expect.any(String) });

      const stillThere = await AuthToken.findById(originalToken._id);
      expect(stillThere).toBeNull(); // old outstanding token invalidated

      const tokens = await AuthToken.find({ userRef: user._id, kind: 'verify_email' });
      expect(tokens).toHaveLength(1);
      expect(tokens[0]._id.toString()).not.toBe(originalToken._id.toString());
    });

    it('responds with the same generic message and issues nothing for an already-verified user', async () => {
      const user = await User.create({
        name: 'Already Verified',
        email: 'alreadyverified@example.com',
        passwordHash: 'hash',
        phone: '94771234567',
        emailVerified: true,
      });

      const result = await authService.resendVerification({ userId: user._id.toString() });
      expect(result).toEqual({ message: expect.any(String) });

      const tokens = await AuthToken.find({ userRef: user._id, kind: 'verify_email' });
      expect(tokens).toHaveLength(0);
    });

    it('responds with the same generic message for a non-existent user id (no error thrown)', async () => {
      const result = await authService.resendVerification({ userId: '64b64b64b64b64b64b64b64b' });
      expect(result).toEqual({ message: expect.any(String) });
    });
  });

  describe('login (FR-2)', () => {
    it('authenticates valid credentials and returns a JWT', async () => {
      await authService.register({
        name: 'Valid User',
        email: 'valid@example.com',
        password: 'secretPassword1',
        phone: '0771234567',
      });

      const loginResult = await authService.login({
        email: 'valid@example.com',
        password: 'secretPassword1',
      });

      expect(loginResult).toHaveProperty('token');
      expect(loginResult.user).toHaveProperty('id');
      expect(loginResult.user.email).toBe('valid@example.com');
    });

    it('does not require the account to be verified', async () => {
      await authService.register({
        name: 'Unverified User',
        email: 'unverified@example.com',
        password: 'secretPassword1',
        phone: '0771234567',
      });

      const loginResult = await authService.login({
        email: 'unverified@example.com',
        password: 'secretPassword1',
      });

      expect(loginResult).toHaveProperty('token');
      expect(loginResult.user.emailVerified).toBe(false);
    });

    it('rejects an invalid password with 401 and generic message', async () => {
      await authService.register({
        name: 'Valid User',
        email: 'valid2@example.com',
        password: 'secretPassword1',
        phone: '0771234567',
      });

      await expect(
        authService.login({
          email: 'valid2@example.com',
          password: 'wrongPassword',
        })
      ).rejects.toMatchObject({
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
      });
    });

    it('rejects an unknown email with the same generic 401 INVALID_CREDENTIALS (no enumeration), still paying the bcrypt cost', async () => {
      const bcrypt = (await import('bcryptjs')).default;
      const compareSpy = jest.spyOn(bcrypt, 'compare');

      await expect(authService.login({ email: 'nobody@example.com', password: 'whatever1' })).rejects.toMatchObject({
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
      });

      // The dummy-hash compare must still run on the not-found path so this
      // path isn't measurably cheaper than a wrong-password-for-a-real-user
      // response (timing oracle fix).
      expect(compareSpy).toHaveBeenCalledWith('whatever1', expect.any(String));

      compareSpy.mockRestore();
    });

    it('rejects missing email/password with 400 VALIDATION_ERROR', async () => {
      await expect(authService.login({ email: '', password: '' })).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });
  });

  describe('forgotPassword (FR-15/FR-16)', () => {
    it('issues a reset_password token for an existing account and returns a generic message', async () => {
      await authService.register({
        name: 'Forgot Me',
        email: 'forgotme@example.com',
        password: 'password123',
        phone: '0771234567',
      });
      const user = await User.findOne({ email: 'forgotme@example.com' });

      const result = await authService.forgotPassword({ email: 'forgotme@example.com' });
      expect(result).toEqual({ message: expect.any(String) });

      const tokens = await AuthToken.find({ userRef: user._id, kind: 'reset_password' });
      expect(tokens).toHaveLength(1);
    });

    it('returns the identical response for a non-existent email, and issues no token', async () => {
      const existing = await authService.forgotPassword({ email: 'forgotme2@example.com' });
      const nonExistent = await authService.forgotPassword({ email: 'ghost@example.com' });

      expect(nonExistent).toEqual(existing);

      const tokens = await AuthToken.find({ kind: 'reset_password' });
      expect(tokens).toHaveLength(0);
    });
  });

  describe('resetPassword (FR-15, D4.3(d))', () => {
    it('sets a new password, invalidates outstanding reset tokens, and revokes existing JWT sessions', async () => {
      await authService.register({
        name: 'Reset Me',
        email: 'resetme@example.com',
        password: 'oldPassword1',
        phone: '0771234567',
      });
      const user = await User.findOne({ email: 'resetme@example.com' });

      const { token: capturedJwt } = await authService.login({
        email: 'resetme@example.com',
        password: 'oldPassword1',
      });
      const decodedBeforeReset = jwt.decode(capturedJwt);

      // generateToken() deliberately sets `iat` 1-2s ahead of the real clock
      // (see authService.js — closes a *different* race, a reissue landing
      // in the same wall-clock second as a revoke). The flip side: revoking
      // this token only reliably catches it once that much real time has
      // actually passed, which a real user reset flow always satisfies but
      // a fast synchronous test might not — so wait it out explicitly. The
      // lead is `ceil((now+1000)/1000)*1000 - now`, which can be just under
      // 2000ms, so wait comfortably past that worst case.
      await new Promise((resolve) => setTimeout(resolve, 2200));

      const { token: rawResetToken } = await tokenService.issueToken(user._id, 'reset_password', 60 * 60 * 1000);
      const otherOutstanding = await tokenService.issueToken(user._id, 'reset_password', 60 * 60 * 1000);

      const result = await authService.resetPassword({ token: rawResetToken, newPassword: 'newPassword1' });
      expect(result).toEqual({ message: expect.any(String) });

      // New password works, old one doesn't.
      await expect(
        authService.login({ email: 'resetme@example.com', password: 'oldPassword1' })
      ).rejects.toMatchObject({ statusCode: 401, code: 'INVALID_CREDENTIALS' });
      const relogin = await authService.login({ email: 'resetme@example.com', password: 'newPassword1' });
      expect(relogin).toHaveProperty('token');

      // Reset token is single-use.
      await expect(
        authService.resetPassword({ token: rawResetToken, newPassword: 'anotherPassword1' })
      ).rejects.toMatchObject({ statusCode: 400, code: 'TOKEN_USED' });

      // Other outstanding reset tokens for this user were invalidated too.
      await expect(
        tokenService.consumeToken(otherOutstanding.token, 'reset_password')
      ).rejects.toMatchObject({ statusCode: 400, code: 'TOKEN_NOT_FOUND' });

      // FR-15/D4.3(d): the JWT captured before the reset is now revoked.
      const revokedBefore = await tokenDenylistService.isRevoked({
        jti: decodedBeforeReset.jti,
        userRef: user._id.toString(),
        iat: decodedBeforeReset.iat,
      });
      expect(revokedBefore).toBe(true);

      // A freshly issued token (post-reset) is not revoked.
      const decodedAfterReset = jwt.decode(relogin.token);
      const revokedAfter = await tokenDenylistService.isRevoked({
        jti: decodedAfterReset.jti,
        userRef: user._id.toString(),
        iat: decodedAfterReset.iat,
      });
      expect(revokedAfter).toBe(false);
    });

    it('rejects an unknown/garbage reset token with 400 TOKEN_NOT_FOUND', async () => {
      await expect(
        authService.resetPassword({ token: 'not-a-real-token', newPassword: 'whatever1' })
      ).rejects.toMatchObject({ statusCode: 400, code: 'TOKEN_NOT_FOUND' });
    });
  });
});
