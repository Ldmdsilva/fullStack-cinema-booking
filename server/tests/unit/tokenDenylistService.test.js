import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import mongoose from 'mongoose';
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import * as tokenDenylistService from '../../src/services/tokenDenylistService.js';

describe('tokenDenylistService Unit Tests', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  const future = () => new Date(Date.now() + 60 * 60 * 1000);

  it('isRevoked returns false for an untouched jti/user', async () => {
    const userRef = new mongoose.Types.ObjectId();
    const nowSeconds = Math.floor(Date.now() / 1000);

    const revoked = await tokenDenylistService.isRevoked({
      jti: 'untouched-jti',
      userRef,
      iat: nowSeconds,
    });

    expect(revoked).toBe(false);
  });

  it('isRevoked returns true after revokeJti for that exact jti, false for a different jti', async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const userRef = new mongoose.Types.ObjectId();

    await tokenDenylistService.revokeJti('revoked-jti', future());

    const revokedMatch = await tokenDenylistService.isRevoked({
      jti: 'revoked-jti',
      userRef,
      iat: nowSeconds,
    });
    expect(revokedMatch).toBe(true);

    const revokedOther = await tokenDenylistService.isRevoked({
      jti: 'some-other-jti',
      userRef,
      iat: nowSeconds,
    });
    expect(revokedOther).toBe(false);
  });

  it('isRevoked returns true for iat before revokedBefore and false for iat at/after it, after revokeAllForUser', async () => {
    const userRef = new mongoose.Types.ObjectId();
    const revokedBefore = new Date();

    await tokenDenylistService.revokeAllForUser(userRef, revokedBefore, future());

    const iatBeforeSeconds = Math.floor((revokedBefore.getTime() - 5000) / 1000);
    const revokedBeforeCase = await tokenDenylistService.isRevoked({
      jti: 'irrelevant-jti-1',
      userRef,
      iat: iatBeforeSeconds,
    });
    expect(revokedBeforeCase).toBe(true);

    const iatAtOrAfterSeconds = Math.ceil((revokedBefore.getTime() + 5000) / 1000);
    const notRevokedCase = await tokenDenylistService.isRevoked({
      jti: 'irrelevant-jti-2',
      userRef,
      iat: iatAtOrAfterSeconds,
    });
    expect(notRevokedCase).toBe(false);
  });

  it('revokeJti and revokeAllForUser are upsert-idempotent (call twice, no throw)', async () => {
    const userRef = new mongoose.Types.ObjectId();

    await expect(tokenDenylistService.revokeJti('idempotent-jti', future())).resolves.toBeDefined();
    await expect(tokenDenylistService.revokeJti('idempotent-jti', future())).resolves.toBeDefined();

    await expect(
      tokenDenylistService.revokeAllForUser(userRef, new Date(), future())
    ).resolves.toBeDefined();
    await expect(
      tokenDenylistService.revokeAllForUser(userRef, new Date(), future())
    ).resolves.toBeDefined();
  });
});
