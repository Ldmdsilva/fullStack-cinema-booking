import { z } from 'zod';

// ADR-014 / §C7.1: the confirm endpoint accepts ONLY `{holdId}`. `.strict()`
// is critical — an unexpected field (an `amount`, a `status`, a
// `paymentIntentId`, or anything else) must be REJECTED with 400
// VALIDATION_ERROR, never silently stripped and ignored (R23).
export const confirmBookingSchema = z.object({
  holdId: z.string().trim().min(1, 'holdId is required'),
}).strict();
