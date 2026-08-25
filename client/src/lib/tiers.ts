// Runtime seat-tier constants. Deliberately separate from `types.ts` — that
// file is type-only and excluded from coverage (see `vitest.config.ts`'s
// `coverage.exclude`), so any runtime logic/values belong here instead where
// they're actually exercised (and measured) by tests.
import type { SeatTier } from './types'

// Mirrors server/src/config/seatTiers.js `SEAT_TIERS` exactly.
export const SEAT_TIERS: SeatTier[] = ['STANDARD', 'PREMIUM', 'RECLINER']

// Mirrors server/src/config/seatTiers.js `TIER_MULTIPLIERS` exactly — the
// server is the sole source of truth for pricing; this copy is for display
// purposes only (e.g. showing a "+35%" badge), never for computing a price
// the server is trusted to charge.
export const TIER_MULTIPLIERS: Record<SeatTier, number> = {
  STANDARD: 1.0,
  PREMIUM: 1.35,
  RECLINER: 1.8,
}

export const TIER_LABELS: Record<SeatTier, string> = {
  STANDARD: 'Standard',
  PREMIUM: 'Premium',
  RECLINER: 'Recliner',
}
