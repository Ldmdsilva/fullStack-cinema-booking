/**
 * Format a major-unit LKR amount as `Rs 6,500.00` for emails/SMS.
 * @param {number} amount
 * @returns {string}
 */
export function formatLkr(amount) {
  return `Rs ${Number(amount).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Format a Date as `Fri 12 Sep 2026 20:00` for emails/SMS.
 * @param {Date} date
 * @returns {string}
 */
export function formatShowtimeDateTime(date) {
  const d = new Date(date);
  const datePart = d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  const timePart = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${datePart} ${timePart}`;
}
