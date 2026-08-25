import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import jwt from 'jsonwebtoken';

// `auth.js` imports `tokenDenylistService` (which itself imports the
// `RevokedToken` mongoose model) — mock it before the dynamic import below
// so this stays a pure unit test with no real database involved, and so
// every branch of `isRevoked`'s resolution/rejection can be controlled
// deterministically per test.
const isRevokedMock = jest.fn();
jest.unstable_mockModule('../../src/services/tokenDenylistService.js', () => ({
  isRevoked: isRevokedMock,
  revokeJti: jest.fn(),
  revokeAllForUser: jest.fn(),
}));

let verifyToken;

const JWT_SECRET = 'auth_unit_test_secret_key';

function buildReq(authHeader) {
  return { headers: authHeader === undefined ? {} : { authorization: authHeader } };
}

describe('auth middleware Unit Tests (verifyToken, FR-3/FR-6)', () => {
  beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    ({ verifyToken } = await import('../../src/middleware/auth.js'));
  });

  beforeEach(() => {
    isRevokedMock.mockReset();
  });

  it('calls next with UNAUTHORIZED when the Authorization header is missing entirely', async () => {
    const req = buildReq(undefined);
    const next = jest.fn();

    await verifyToken(req, {}, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
    expect(isRevokedMock).not.toHaveBeenCalled();
  });

  it('calls next with UNAUTHORIZED when the header is present but missing the "Bearer " prefix', async () => {
    const req = buildReq('Basic somecreds');
    const next = jest.fn();

    await verifyToken(req, {}, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
    expect(isRevokedMock).not.toHaveBeenCalled();
  });

  it('calls next with TOKEN_EXPIRED for an expired token', async () => {
    const expiredToken = jwt.sign({ id: 'u1', email: 'a@b.com', role: 'customer' }, JWT_SECRET, {
      expiresIn: -10,
    });
    const req = buildReq(`Bearer ${expiredToken}`);
    const next = jest.fn();

    await verifyToken(req, {}, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('TOKEN_EXPIRED');
    expect(isRevokedMock).not.toHaveBeenCalled();
  });

  it('calls next with INVALID_TOKEN for a garbage/invalid-signature token', async () => {
    const badToken = jwt.sign({ id: 'u1' }, 'a-completely-different-secret');
    const req = buildReq(`Bearer ${badToken}`);
    const next = jest.fn();

    await verifyToken(req, {}, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('INVALID_TOKEN');
    expect(isRevokedMock).not.toHaveBeenCalled();
  });

  it('calls next with INVALID_TOKEN for a non-JWT garbage string', async () => {
    const req = buildReq('Bearer not-a-real-jwt-at-all');
    const next = jest.fn();

    await verifyToken(req, {}, next);

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('INVALID_TOKEN');
  });

  it('sets req.user and calls next() with no args for a valid, non-revoked token', async () => {
    isRevokedMock.mockResolvedValue(false);
    const token = jwt.sign({ id: 'u1', email: 'a@b.com', role: 'customer' }, JWT_SECRET);
    const req = buildReq(`Bearer ${token}`);
    const next = jest.fn();

    await verifyToken(req, {}, next);

    expect(isRevokedMock).toHaveBeenCalledTimes(1);
    const callArg = isRevokedMock.mock.calls[0][0];
    expect(callArg.userRef).toBe('u1');
    expect(typeof callArg.iat).toBe('number');

    expect(req.user).toMatchObject({ id: 'u1', email: 'a@b.com', role: 'customer' });
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it('calls next with TOKEN_REVOKED when the token was revoked by jti', async () => {
    isRevokedMock.mockResolvedValue(true);
    const token = jwt.sign({ id: 'u1', jti: 'revoked-jti', role: 'customer' }, JWT_SECRET);
    const req = buildReq(`Bearer ${token}`);
    const next = jest.fn();

    await verifyToken(req, {}, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('TOKEN_REVOKED');
    expect(req.user).toBeUndefined();
  });

  it('calls next with TOKEN_REVOKED when the token was swept up by a user-wide revocation', async () => {
    isRevokedMock.mockResolvedValue(true);
    const token = jwt.sign({ id: 'u2', role: 'customer' }, JWT_SECRET);
    const req = buildReq(`Bearer ${token}`);
    const next = jest.fn();

    await verifyToken(req, {}, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('TOKEN_REVOKED');
  });

  it('forwards a rejected isRevoked() promise to next(error) instead of throwing/swallowing it', async () => {
    const dbError = new Error('denylist DB hiccup');
    isRevokedMock.mockRejectedValue(dbError);
    const token = jwt.sign({ id: 'u3', role: 'customer' }, JWT_SECRET);
    const req = buildReq(`Bearer ${token}`);
    const next = jest.fn();

    await expect(verifyToken(req, {}, next)).resolves.toBeUndefined();

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(dbError);
  });
});
