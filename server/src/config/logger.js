import pino from 'pino';
import { env } from './env.js';

/**
 * Structured JSON application logger (§A11). Test runs always stay silent
 * regardless of `.env`'s LOG_LEVEL, so `.env` can carry a dev-friendly
 * default without cluttering `npm test` output.
 */
export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL || 'info',
});
