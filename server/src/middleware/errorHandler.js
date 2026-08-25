/**
 * Custom application error with HTTP status and code
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_SERVER_ERROR', details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Global error-handling middleware (§C7.1, §C7.3)
 */
export function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || 500;
  let code = err.code || 'INTERNAL_SERVER_ERROR';
  let message = err.message || 'An unexpected error occurred';
  let details = err.details || null;

  // Handle Mongoose validation errors
  if (err.name === 'ValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Invalid input data provided';
    details = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
  }

  // Handle Mongoose CastError (invalid ObjectId)
  if (err.name === 'CastError') {
    statusCode = 400;
    code = 'INVALID_IDENTIFIER';
    message = `Invalid format for resource identifier: ${err.value}`;
    details = { field: err.path, value: err.value };
  }

  // Handle Mongoose duplicate key error (E11000)
  if (err.code === 11000) {
    statusCode = 409;
    code = 'DUPLICATE_RESOURCE';
    const field = Object.keys(err.keyValue || {})[0] || 'resource';
    message = `A resource with that ${field} already exists`;
    details = err.keyValue;
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = 'INVALID_TOKEN';
    message = 'Invalid authentication token';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    code = 'TOKEN_EXPIRED';
    message = 'Authentication token has expired';
  }

  // Log non-operational/500 errors
  if (statusCode >= 500) {
    console.error(`[Error] 5xx Server Error: ${err.message}`, err.stack);
    // Conceal internal stack traces in client response
    if (process.env.NODE_ENV === 'production') {
      message = 'An unexpected server error occurred. Please try again later.';
      details = null;
    }
  }

  return res.status(statusCode).json({
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  });
}
