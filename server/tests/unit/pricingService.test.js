import { describe, it, expect } from '@jest/globals';
import { computeSeatTotal } from '../../src/services/pricingService.js';
import { env } from '../../src/config/env.js';

function buildShowtime(seats) {
  return { seats };
}

describe('pricingService.computeSeatTotal (anti-tampering price guard)', () => {
  it('sums the stored frozen price of each requested seat', () => {
    const showtime = buildShowtime([
      { id: 'A1', price: 500 },
      { id: 'A2', price: 500 },
      { id: 'B1', price: 675 },
    ]);

    const result = computeSeatTotal(showtime, ['A1', 'B1']);

    expect(result.totalPrice).toBe(1175);
    expect(result.currency).toBe(env.STRIPE_CURRENCY.toUpperCase());
  });

  it('never recomputes price from basePrice/tier — uses only the stored seat price', () => {
    const showtime = { basePrice: 100, seats: [{ id: 'A1', tier: 'PREMIUM', price: 999 }] };
    const result = computeSeatTotal(showtime, ['A1']);
    expect(result.totalPrice).toBe(999);
  });

  it('throws SEAT_NOT_FOUND when a requested seat id does not exist on the showtime', () => {
    const showtime = buildShowtime([{ id: 'A1', price: 500 }]);

    expect(() => computeSeatTotal(showtime, ['A1', 'ZZZ'])).toThrow(
      expect.objectContaining({ statusCode: 400, code: 'SEAT_NOT_FOUND' })
    );
  });

  it('returns a zero total for an empty seatIds array', () => {
    const showtime = buildShowtime([{ id: 'A1', price: 500 }]);
    const result = computeSeatTotal(showtime, []);
    expect(result.totalPrice).toBe(0);
  });
});
