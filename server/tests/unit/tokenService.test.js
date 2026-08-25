import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import mongoose from 'mongoose';
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import * as tokenService from '../../src/services/tokenService.js';
import AuthToken from '../../src/models/AuthToken.js';

describe('tokenService Unit Tests', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  it('issues and consumes a token round-trip, returning the right userRef', async () => {
    const userRef = new mongoose.Types.ObjectId();

    const { token, expiresAt } = await tokenService.issueToken(userRef, 'verify_email', 60_000);

    expect(typeof token).toBe('string');
    expect(token).toHaveLength(64); // 32 bytes hex-encoded
    expect(expiresAt).toBeInstanceOf(Date);

    const consumed = await tokenService.consumeToken(token, 'verify_email');

    expect(consumed.userRef.toString()).toBe(userRef.toString());
    expect(consumed.usedAt).toBeInstanceOf(Date);
  });

  it('throws TOKEN_USED when consuming an already-used token a second time', async () => {
    const userRef = new mongoose.Types.ObjectId();
    const { token } = await tokenService.issueToken(userRef, 'reset_password', 60_000);

    await tokenService.consumeToken(token, 'reset_password');

    await expect(tokenService.consumeToken(token, 'reset_password')).rejects.toMatchObject({
      statusCode: 400,
      code: 'TOKEN_USED',
    });
  });

  it('throws TOKEN_NOT_FOUND for an unknown/garbage token', async () => {
    await expect(tokenService.consumeToken('not-a-real-token', 'verify_email')).rejects.toMatchObject({
      statusCode: 400,
      code: 'TOKEN_NOT_FOUND',
    });
  });

  it('throws TOKEN_NOT_FOUND for an expired-but-not-yet-swept token', async () => {
    const userRef = new mongoose.Types.ObjectId();
    const rawToken = 'a'.repeat(64);
    const crypto = await import('node:crypto');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    await AuthToken.create({
      userRef,
      tokenHash,
      kind: 'reset_password',
      expiresAt: new Date(Date.now() - 1000), // already in the past
    });

    await expect(tokenService.consumeToken(rawToken, 'reset_password')).rejects.toMatchObject({
      statusCode: 400,
      code: 'TOKEN_NOT_FOUND',
    });
  });

  it('invalidateOutstandingTokens removes only matching userRef+kind rows', async () => {
    const userA = new mongoose.Types.ObjectId();
    const userB = new mongoose.Types.ObjectId();

    const { token: tokenA1 } = await tokenService.issueToken(userA, 'reset_password', 60_000);
    await tokenService.issueToken(userA, 'reset_password', 60_000);
    const { token: tokenAOtherKind } = await tokenService.issueToken(userA, 'verify_email', 60_000);
    const { token: tokenB } = await tokenService.issueToken(userB, 'reset_password', 60_000);

    const deletedCount = await tokenService.invalidateOutstandingTokens(userA, 'reset_password');

    expect(deletedCount).toBe(2);

    // userA's reset_password tokens are gone
    await expect(tokenService.consumeToken(tokenA1, 'reset_password')).rejects.toMatchObject({
      code: 'TOKEN_NOT_FOUND',
    });

    // userA's verify_email token is untouched
    const consumedOtherKind = await tokenService.consumeToken(tokenAOtherKind, 'verify_email');
    expect(consumedOtherKind.userRef.toString()).toBe(userA.toString());

    // userB's reset_password token is untouched
    const consumedB = await tokenService.consumeToken(tokenB, 'reset_password');
    expect(consumedB.userRef.toString()).toBe(userB.toString());
  });
});
