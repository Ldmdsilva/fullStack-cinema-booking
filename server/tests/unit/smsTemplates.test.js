import { describe, expect, it } from '@jest/globals';
import { bookingConfirmedSms, bookingCancelledSms } from '../../src/templates/sms.js';

describe('bookingConfirmedSms', () => {
  it('renders the film title from the confirmService shim shape ({title, date}), not a concert artist field', () => {
    const sms = bookingConfirmedSms({
      booking: {
        reference: 'ENC-1234',
        seats: [{ row: 'A', number: 1 }],
        totalPrice: 3000,
      },
      event: { title: 'The Marfa Sessions', date: '2026-09-12T20:00:00.000Z' },
      venue: { name: 'The Half Moon', city: 'Colombo' },
    });

    expect(sms).toContain('The Marfa Sessions');
    expect(sms).not.toContain('undefined');
  });
});

describe('bookingCancelledSms', () => {
  it('does not leak undefined for a cancelled booking', () => {
    const sms = bookingCancelledSms({ booking: { reference: 'ENC-1234', totalPrice: 3000 } });
    expect(sms).not.toContain('undefined');
  });
});
