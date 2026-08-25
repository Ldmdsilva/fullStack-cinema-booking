import { describe, it, expect, beforeAll } from '@jest/globals';
import { createNodemailerMock, mockNodemailerModule } from '../helpers/mocks.js';
import { bookingConfirmedTemplate } from '../../src/templates/email/bookingConfirmed.js';
import { formatLkr } from '../../src/utils/currency.js';

// nodemailer must be mocked before the dynamic import of emailService.js
// below, since emailService.js imports 'nodemailer' at module scope.
const { sendMailMock, nodemailerMock } = createNodemailerMock();
mockNodemailerModule(nodemailerMock);

let sendEmail;

const booking = {
  reference: 'ENC-4471',
  seats: [
    { id: 'A-1', section: 'Stalls', row: 'A', number: 1, price: 6500 },
    { id: 'A-2', section: 'Stalls', row: 'A', number: 2, price: 6500 },
  ],
  totalPrice: 13000,
};
const event = { title: 'Phoebe Wren Live', date: new Date('2026-09-12T20:00:00Z') };
const venue = { name: 'Corn Exchange', city: 'Colombo' };

describe('templates/email/bookingConfirmed.js — content (Phase 3)', () => {
  it('includes the booking reference, seat list, and total in both the HTML and text output', () => {
    const { html, text, subject } = bookingConfirmedTemplate({ booking, event, venue });
    const total = formatLkr(booking.totalPrice);

    expect(subject).toContain(booking.reference);

    for (const output of [html, text]) {
      expect(output).toContain(booking.reference);
      expect(output).toContain(total);
      // Seat list uses "<section> <row><number>" per bookingConfirmedTemplate
      expect(output).toContain('Stalls A1');
      expect(output).toContain('Stalls A2');
    }
  });

  it('renders one ticket stub per seat in the HTML output', () => {
    const { html } = bookingConfirmedTemplate({ booking, event, venue });
    // Two seats -> two stub blocks; a crude but effective proxy is counting
    // how many times the venue name (present once per stub) appears.
    const stubOccurrences = html.split(venue.name).length - 1;
    expect(stubOccurrences).toBeGreaterThanOrEqual(booking.seats.length);
  });
});

describe('notification/emailService.js — sendEmail (ADR-012: notifications never break a booking)', () => {
  beforeAll(async () => {
    ({ sendEmail } = await import('../../src/services/notification/emailService.js'));
  });

  it('sends successfully via the transporter and resolves with the transporter result', async () => {
    const result = await sendEmail({
      to: 'fan@example.com',
      subject: 'Booking confirmed',
      html: '<p>hi</p>',
      text: 'hi',
    });

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'fan@example.com', subject: 'Booking confirmed' })
    );
    expect(result).toBeDefined();
  });

  it('resolves (never throws) when the transporter rejects — a dead SMTP host must not break a paid booking', async () => {
    sendMailMock.mockRejectedValueOnce(new Error('SMTP connection refused'));

    await expect(
      sendEmail({ to: 'fan@example.com', subject: 'Booking confirmed', html: '<p>hi</p>', text: 'hi' })
    ).resolves.toBeUndefined();
  });
});
