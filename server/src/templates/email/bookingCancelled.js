import { emailLayout } from './layout.js';
import { formatLkr } from '../../utils/currency.js';

/**
 * @param {{ booking: object, refunded: boolean }} params
 * @returns {{ subject: string, html: string, text: string }}
 */
export function bookingCancelledTemplate({ booking, refunded }) {
  const total = formatLkr(booking.totalPrice);
  const refundNote = refunded ? ` ${total} will be refunded to your card within 5-10 business days.` : '';
  const text = `Booking ${booking.reference} cancelled.${refundNote}`;
  const bodyHtml = `<p style="color:#F5F1EA;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;">${text}</p>`;

  return {
    subject: `Booking cancelled — ${booking.reference}`,
    html: emailLayout({ title: 'Booking cancelled', bodyHtml }),
    text,
  };
}
