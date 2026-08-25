import crypto from 'node:crypto';
import AuthToken from '../models/AuthToken.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Manages single-use AuthToken rows used for out-of-band flows such as
 * email verification and password reset links. These are NOT JWTs — they
 * are opaque random tokens embedded in emailed links.
 */

/**
 * Hash a raw token the same way on issue and on consume so lookups always
 * go through the unique `tokenHash` index rather than a raw-string compare.
 * @param {string} rawToken
 * @returns {string}
 */
function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Issue a new single-use token for a user (e.g. email verification or
 * password reset). Only the raw token is ever returned — the raw value is
 * what gets embedded in the emailed link, while the hash is what's
 * persisted, so a database leak alone can't be replayed into a valid token.
 * @param {string|import('mongoose').Types.ObjectId} userRef
 * @param {'verify_email'|'reset_password'} kind
 * @param {number} ttlMs - time-to-live in milliseconds
 * @returns {Promise<{ token: string, expiresAt: Date }>}
 */
export async function issueToken(userRef, kind, ttlMs) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + ttlMs);

  await AuthToken.create({ userRef, tokenHash, kind, expiresAt });

  return { token: rawToken, expiresAt };
}

/**
 * Consume (redeem) a single-use token. Marks it used and returns the full
 * AuthToken document so the caller can read `userRef` off it.
 *
 * Note on timing safety: we never compare the raw token against a stored
 * value in application code (which is where a timing side-channel would
 * matter). Instead we hash the incoming token and look it up by its unique
 * `tokenHash` index — a DB index lookup isn't vulnerable to the same
 * in-process timing attack as a raw `===`/string compare, so no additional
 * `crypto.timingSafeEqual` is needed here.
 *
 * @param {string} rawToken
 * @param {'verify_email'|'reset_password'} kind
 * @returns {Promise<import('mongoose').Document>}
 */
export async function consumeToken(rawToken, kind) {
  const tokenHash = hashToken(rawToken);
  const authToken = await AuthToken.findOne({ tokenHash, kind });

  // Treat "never existed" and "expired but not yet TTL-swept" identically —
  // both are generic not-found errors so we don't leak which case occurred,
  // and we don't rely on Mongo's background TTL sweep timing to have already
  // removed the stale row.
  if (!authToken || authToken.expiresAt <= new Date()) {
    throw new AppError('Invalid or expired token', 400, 'TOKEN_NOT_FOUND');
  }

  if (authToken.usedAt) {
    throw new AppError('This token has already been used', 400, 'TOKEN_USED');
  }

  authToken.usedAt = new Date();
  await authToken.save();

  return authToken;
}

/**
 * Invalidate all outstanding (not yet used, not yet expired) tokens of a
 * given kind for a user. Used e.g. after a successful password reset to
 * invalidate any other still-live reset tokens. These rows carry no audit
 * requirement, so a hard delete is sufficient.
 * @param {string|import('mongoose').Types.ObjectId} userRef
 * @param {'verify_email'|'reset_password'} kind
 * @returns {Promise<number>} count of deleted tokens
 */
export async function invalidateOutstandingTokens(userRef, kind) {
  const result = await AuthToken.deleteMany({
    userRef,
    kind,
    usedAt: null,
    expiresAt: { $gt: new Date() },
  });
  return result.deletedCount;
}
