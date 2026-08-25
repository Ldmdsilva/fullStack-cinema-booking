import { z } from 'zod';

/**
 * `.strict()` is important here: it rejects an unexpected field (e.g. an
 * `amount` a malicious/buggy client tries to smuggle in), forcing the
 * server to remain the sole authority on price (§C6.3, D8) — this endpoint
 * accepts a seat selection, never a price.
 */
export const createHoldSchema = z
  .object({
    showtimeId: z.string().trim().min(1, 'showtimeId is required'),
    seatIds: z.array(z.string().trim().min(1)).min(1, 'At least one seat must be selected'),
  })
  .strict();
