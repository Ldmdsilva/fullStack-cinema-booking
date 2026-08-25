import { describe, it, expect } from '@jest/globals';
import {
  SEAT_TIERS,
  TIER_MULTIPLIERS,
  MAX_SEATS_PER_SCREEN,
  tierPrice,
} from '../../src/config/seatTiers.js';

describe('config/seatTiers.js', () => {
  it('enumerates the three seat tiers', () => {
    expect(SEAT_TIERS).toEqual(['STANDARD', 'PREMIUM', 'RECLINER']);
  });

  it('exposes the expected multiplier for each tier', () => {
    expect(TIER_MULTIPLIERS.STANDARD).toBe(1.0);
    expect(TIER_MULTIPLIERS.PREMIUM).toBe(1.35);
    expect(TIER_MULTIPLIERS.RECLINER).toBe(1.8);
  });

  it('caps a screen at 300 seats', () => {
    expect(MAX_SEATS_PER_SCREEN).toBe(300);
  });

  it.each([
    ['STANDARD', 1000, 1000],
    ['PREMIUM', 1000, 1350],
    ['RECLINER', 1000, 1800],
  ])('applies the %s multiplier to a base price of %i minor units -> %i', (tier, basePriceMinor, expected) => {
    expect(tierPrice(basePriceMinor, tier)).toBe(expected);
  });

  it('rounds a fractional result to the nearest whole minor unit (round-half-up)', () => {
    // 999 * 1.35 = 1348.65 -> rounds up to 1349
    expect(tierPrice(999, 'PREMIUM')).toBe(1349);
  });

  it('never returns a fractional minor-unit amount', () => {
    for (const tier of SEAT_TIERS) {
      const price = tierPrice(777, tier);
      expect(Number.isInteger(price)).toBe(true);
    }
  });

  it('throws a 400 AppError for an unknown tier', () => {
    expect(() => tierPrice(1000, 'VIP')).toThrow('Unknown seat tier: VIP');

    try {
      tierPrice(1000, 'VIP');
      throw new Error('expected tierPrice to throw');
    } catch (error) {
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('INVALID_SEAT_TIER');
    }
  });
});
