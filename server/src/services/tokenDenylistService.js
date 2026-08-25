import RevokedToken from '../models/RevokedToken.js';

/**
 * Manages JWT revocation via RevokedToken rows. Intended to be consulted by
 * `middleware/auth.js` on every authenticated request (a later phase) so
 * that logged-out/rotated JWTs stop being accepted before their natural
 * `exp` claim arrives.
 */

/**
 * Revoke a single JWT by its `jti` claim. Idempotent — revoking the same
 * jti twice must not throw a duplicate-key error, hence upsert.
 * @param {string} jti
 * @param {Date} expiresAt - when this revocation record itself may be
 *   garbage-collected (normally the JWT's own `exp`, converted to a Date)
 * @returns {Promise<import('mongoose').Document>}
 */
export async function revokeJti(jti, expiresAt) {
  return RevokedToken.findOneAndUpdate(
    { kind: 'jti', jti },
    { $set: { kind: 'jti', jti, expiresAt } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
}

/**
 * Revoke every JWT previously issued to a user as of `revokedBefore`
 * (e.g. "log out everywhere" or a password reset). Idempotent/upsert per
 * user, keyed on `{ kind: 'user', userRef }`.
 *
 * CONTRACT — read before calling this from a flow that also *reissues* a
 * JWT (e.g. `authService.resetPassword`):
 *
 * JWT `iat` is truncated to whole seconds. If this function is called with
 * `revokedBefore = new Date()` (millisecond precision) and a replacement
 * JWT is minted within that same wall-clock second, the new JWT's `iat`
 * (also truncated down to that second's :00) can be numerically <=
 * `revokedBefore`, which would make `isRevoked` incorrectly reject the
 * BRAND NEW token as revoked.
 *
 * This function only stores whatever `revokedBefore` Date it is given — it
 * has no control over when the caller mints the next JWT, so it cannot fix
 * this itself. The caller is responsible for revoking with
 * `revokedBefore = now`, then waiting until the *next whole second*
 * (e.g. `new Date(Math.ceil(Date.now() / 1000) * 1000 + 1000)`) before
 * issuing the replacement JWT, so the replacement's truncated `iat` is
 * guaranteed to land after `revokedBefore`.
 *
 * @param {string|import('mongoose').Types.ObjectId} userRef
 * @param {Date} revokedBefore - JWTs with `iat` before this instant are revoked
 * @param {Date} expiresAt - when this revocation record itself may be
 *   garbage-collected (normally the app's max JWT lifetime out from now)
 * @returns {Promise<import('mongoose').Document>}
 */
export async function revokeAllForUser(userRef, revokedBefore, expiresAt) {
  return RevokedToken.findOneAndUpdate(
    { kind: 'user', userRef },
    { $set: { kind: 'user', userRef, revokedBefore, expiresAt } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
}

/**
 * Check whether a decoded JWT's claims correspond to a revoked token —
 * either revoked individually by `jti`, or swept up by a user-wide
 * revocation issued after the token was minted.
 * @param {object} claims
 * @param {string} claims.jti
 * @param {string|import('mongoose').Types.ObjectId} claims.userRef
 * @param {number} claims.iat - JWT `iat` claim, whole seconds since epoch
 * @returns {Promise<boolean>}
 */
export async function isRevoked({ jti, userRef, iat }) {
  const result = await RevokedToken.exists({
    $or: [
      { kind: 'jti', jti },
      { kind: 'user', userRef, revokedBefore: { $gt: new Date(iat * 1000) } },
    ],
  });
  return !!result;
}
