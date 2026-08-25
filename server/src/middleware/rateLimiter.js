import { env } from '../config/env.js';
import { AppError } from './errorHandler.js';
import RateCounter from '../models/RateCounter.js';

/**
 * Mongo-backed fixed-window rate limiter factory (ADR-013 Option D / D5).
 * Redis has been dropped as a dependency for compliance reasons (no second
 * database), so window counters live in the `RateCounter` collection
 * (TTL-indexed on `expiresAt`) instead of in-process memory — this way
 * limits survive a server restart (NFR-6).
 *
 * @param {Object} options
 * @param {number} options.windowMs - fixed window length in milliseconds
 * @param {number} options.max - max requests allowed per window
 * @param {string} options.keyPrefix - namespaces the counter key per limiter
 * @param {string} options.message - human-readable message for the 429 error
 * @returns {(req: import('express').Request, res: import('express').Response, next: Function) => Promise<void>}
 */
function createLimiter({ windowMs, max, keyPrefix, message }) {
  return async function rateLimiterMiddleware(req, res, next) {
    const key = `${keyPrefix}:${req.ip}`;

    try {
      // Try to bump the counter of a still-live window.
      let counter = await RateCounter.findOneAndUpdate(
        { key, expiresAt: { $gt: new Date() } },
        { $inc: { count: 1 } },
        { returnDocument: 'after' }
      );

      if (!counter) {
        // Either this key has never been seen, or its previous window has
        // expired — start a fresh one. `upsert` covers both cases.
        try {
          counter = await RateCounter.findOneAndUpdate(
            { key },
            { $set: { count: 1, expiresAt: new Date(Date.now() + windowMs) } },
            { upsert: true, returnDocument: 'after' }
          );
        } catch (err) {
          if (err && err.code === 11000) {
            // Lost a race with a concurrent request that created the fresh
            // window first — retry the increment once against it.
            counter = await RateCounter.findOneAndUpdate(
              { key, expiresAt: { $gt: new Date() } },
              { $inc: { count: 1 } },
              { returnDocument: 'after' }
            );
          } else {
            throw err;
          }
        }
      }

      if (!counter) {
        // Rate limiting is defense-in-depth; never let it hard-fail a
        // request on its own, even after the retry above.
        return next();
      }

      if (counter.count > max) {
        return next(new AppError(message, 429, 'RATE_LIMITED'));
      }

      return next();
    } catch (err) {
      // Fail open on any unexpected error (e.g. a transient DB hiccup)
      // rather than turning a rate-limit failure into a 500 outage.
      return next();
    }
  };
}

/**
 * Rate limiter for authentication routes (NFR-5)
 * Limits repeated requests from the same IP to prevent brute-force attacks
 */
export const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === 'test' ? 1000 : 20, // Allow more in tests, limit to 20 in production/dev
  keyPrefix: 'authLimiter',
  message: 'Too many authentication attempts. Please try again after 15 minutes.',
});

/**
 * Rate limiter for booking creation (a seat hold is now a resource that can
 * be exhausted). Kept high in tests so the D4.3 concurrency burst is
 * governed only by the atomic seat guard, not by this limiter.
 */
export const bookingLimiter = createLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === 'test' ? 10000 : 30, // Allow more in tests, limit to 30 in production/dev
  keyPrefix: 'bookingLimiter',
  message: 'Too many booking attempts. Please try again after 15 minutes.',
});
