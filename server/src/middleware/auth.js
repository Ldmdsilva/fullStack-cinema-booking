import jwt from 'jsonwebtoken';
import { AppError } from './errorHandler.js';
import * as tokenDenylistService from '../services/tokenDenylistService.js';

/**
 * Middleware to verify JWT token and attach user payload to req.user (FR-3, ADR-005)
 *
 * Also consults the token denylist (FR-6) so a revoked JWT — e.g. logged out
 * or invalidated by a password reset — stops being accepted before its
 * natural `exp` claim arrives, even though the signature/expiry check above
 * still passes for it.
 *
 * `verifyToken` is `async`. Express 5 natively forwards a rejected promise
 * returned by a middleware function to `next(error)` (unlike Express 4,
 * which required manual try/catch or a wrapper for this), so strictly
 * speaking this outer try/catch isn't required to avoid an unhandled
 * rejection when this runs inside an Express request — it's kept anyway so
 * `next(error)` is called explicitly and deterministically regardless of
 * caller (Express route chain or a direct unit-test invocation).
 */
export async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(
      new AppError('Authentication token is missing or invalid', 401, 'UNAUTHORIZED')
    );
  }

  const token = authHeader.split(' ')[1];

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return next(new AppError('Authentication token has expired', 401, 'TOKEN_EXPIRED'));
    }
    return next(new AppError('Invalid authentication token', 401, 'INVALID_TOKEN'));
  }

  try {
    const revoked = await tokenDenylistService.isRevoked({
      jti: decoded.jti,
      userRef: decoded.id,
      iat: decoded.iat,
    });

    if (revoked) {
      return next(new AppError('Authentication token has been revoked', 401, 'TOKEN_REVOKED'));
    }

    req.user = decoded; // { id: userId, email: userEmail, role: userRole }
    next();
  } catch (error) {
    next(error);
  }
}
