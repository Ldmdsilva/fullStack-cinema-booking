import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import mongoose from 'mongoose';
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import { requireVerified } from '../../src/middleware/verifiedGuard.js';
import User from '../../src/models/User.js';

describe('verifiedGuard Unit Tests (requireVerified, FR-6)', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  async function createUser(emailVerified) {
    return User.create({
      name: 'Guard Test User',
      email: `guard-${emailVerified}-${Date.now()}@example.com`,
      passwordHash: 'hash',
      phone: '94771234567',
      role: 'customer',
      emailVerified,
    });
  }

  it('calls next() with no args when the user is verified', async () => {
    const user = await createUser(true);
    const req = { user: { id: user._id.toString() } };
    const next = jest.fn();

    await requireVerified(req, {}, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it('calls next with EMAIL_NOT_VERIFIED (403) when the user is unverified', async () => {
    const user = await createUser(false);
    const req = { user: { id: user._id.toString() } };
    const next = jest.fn();

    await requireVerified(req, {}, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('calls next with UNAUTHORIZED (401) when the user id does not resolve to any user', async () => {
    const nonExistentId = new mongoose.Types.ObjectId().toString();
    const req = { user: { id: nonExistentId } };
    const next = jest.fn();

    await requireVerified(req, {}, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('calls next with UNAUTHORIZED (401) when req.user is missing entirely', async () => {
    const req = {};
    const next = jest.fn();

    await requireVerified(req, {}, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
  });
});
