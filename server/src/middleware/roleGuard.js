import { AppError } from './errorHandler.js';

/**
 * Middleware to enforce role-based authorization (FR-4)
 * @param {...string} allowedRoles - e.g. 'admin', 'customer'
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError(
          `Forbidden: role '${req.user.role}' is not authorized to access this resource`,
          403,
          'FORBIDDEN'
        )
      );
    }

    next();
  };
}
