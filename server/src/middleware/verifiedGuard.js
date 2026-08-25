import { AppError } from './errorHandler.js';
import User from '../models/User.js';

/**
 * Middleware to block unverified users from protected actions (FR-6).
 * Must run AFTER `verifyToken` in the route chain, e.g.:
 *   router.post('/holds', verifyToken, requireVerified, ...)
 *
 * `req.user` is the decoded JWT payload set by `verifyToken`, but a JWT is
 * never reissued when a user later verifies their email, so its claims can
 * be stale — this middleware always looks up the user's CURRENT
 * `emailVerified` status fresh from the database rather than trusting the
 * token payload.
 *
 * `requireVerified` is `async`. Express 5 natively forwards a rejected
 * promise returned by a middleware function to `next(error)`, so strictly
 * speaking a try/catch isn't required to avoid an unhandled rejection when
 * this runs inside an Express request — it's kept anyway so `next(error)`
 * is called explicitly and deterministically regardless of caller (same
 * reasoning as `middleware/auth.js`).
 */
export async function requireVerified(req, res, next) {
  if (!req.user) {
    return next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
  }

  try {
    const user = await User.findById(req.user.id).select('emailVerified').lean();

    if (!user) {
      return next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
    }

    if (!user.emailVerified) {
      return next(
        new AppError('Please verify your email address before continuing', 403, 'EMAIL_NOT_VERIFIED')
      );
    }

    next();
  } catch (error) {
    next(error);
  }
}
