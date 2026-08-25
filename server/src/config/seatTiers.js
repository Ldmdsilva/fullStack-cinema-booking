import { AppError } from '../middleware/errorHandler.js';

/**
 * Single source of truth for seat-tier pricing across the cinema domain.
 * Consumed (in later phases) by the `Seat` model's `tier` enum, request
 * validators, `showtimeService`, the seed script, and response serializers —
 * so tier identifiers and multipliers must only ever be changed here.
 */

/**
 * Uppercase seat-tier identifiers, in ascending price order. Doubles as the
 * `Seat.tier` schema enum value elsewhere.
 */
export const SEAT_TIERS = Object.freeze(['STANDARD', 'PREMIUM', 'RECLINER']);

/**
 * Price multiplier applied to a showtime's base price (minor units) to get
 * the actual per-seat price for that tier.
 */
export const TIER_MULTIPLIERS = Object.freeze({
  STANDARD: 1.0,
  PREMIUM: 1.35,
  RECLINER: 1.8,
});

/**
 * Hard cap on the number of seats a single screen may define. Guards against
 * pathological seat-map sizes at the model/validator layer.
 */
export const MAX_SEATS_PER_SCREEN = 300;

/**
 * Compute the per-seat price for a given tier from a showtime's base price.
 * Amounts are in minor currency units (e.g. cents), matching what Stripe
 * expects, so the result is always rounded to the nearest whole minor unit
 * (never fractional cents) using standard round-half-up rounding.
 * @param {number} basePriceMinor - Base price in minor currency units.
 * @param {string} tier - One of `SEAT_TIERS`.
 * @returns {number} Tier price in minor currency units, rounded to an integer.
 */
export function tierPrice(basePriceMinor, tier) {
  const multiplier = TIER_MULTIPLIERS[tier];
  if (multiplier === undefined) {
    throw new AppError(`Unknown seat tier: ${tier}`, 400, 'INVALID_SEAT_TIER', { tier });
  }

  return Math.round(basePriceMinor * multiplier);
}
