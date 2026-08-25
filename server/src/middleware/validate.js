import { AppError } from './errorHandler.js';

/**
 * Validation middleware factory (NFR-4). Validates `req[source]` against a
 * zod schema and replaces it with the parsed (and coerced/trimmed) value on
 * success, or throws the existing VALIDATION_ERROR envelope on failure.
 * @param {import('zod').ZodType} schema
 * @param {'body'|'query'|'params'} [source]
 */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      return next(new AppError('Invalid input data provided', 400, 'VALIDATION_ERROR', details));
    }

    req[source] = result.data;
    next();
  };
}
