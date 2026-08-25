import { emailLayout, ticketStubHtml } from './layout.js';
import { formatLkr, formatShowtimeDateTime } from '../../utils/currency.js';

/**
 * @param {{ booking: object, event: object, venue: object }} params
 * @returns {{ subject: string, html: string, text: string }}
 */
export function bookingConfirmedTemplate({ booking, event, venue }) {
  const dateLabel = formatShowtimeDateTime(event.date);
  const venueLabel = venue ? `${venue.name}, ${venue.city}` : '';
  const seatList = booking.seats.map((seat) => `${seat.section} ${seat.row}${seat.number}`).join(', ');
  const total = formatLkr(booking.totalPrice);

  const stubsHtml = booking.seats
    .map((seat) => ticketStubHtml({ eventTitle: event.title, dateLabel, venueLabel, seat, reference: booking.reference }))
    .join('');

  const bodyHtml = `
    <p style="color:#F5F1EA;font-family:Arial,Helvetica,sans-serif;font-size:14px;">
      Your booking <strong>${booking.reference}</strong> is confirmed. Seats: ${seatList}.
    </p>
    ${stubsHtml}
    <p style="color:#F5F1EA;font-family:Arial,Helvetica,sans-serif;font-size:14px;">Total paid: ${total}</p>
  `;

  const text = `Booking ${booking.reference} confirmed. ${event.title}, ${dateLabel}, ${venueLabel}. Seats: ${seatList}. Total ${total}.`;

  return {
    subject: `Booking confirmed — ${booking.reference}`,
    html: emailLayout({ title: 'Booking confirmed', bodyHtml }),
    text,
  };
}
