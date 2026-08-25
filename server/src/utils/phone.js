const LK_MOBILE_PATTERN = /^94[1-9][0-9]{8}$/;

/**
 * Normalise a Sri Lankan mobile number to the bare `94XXXXXXXXX` form
 * notify.lk expects. Accepts `0771234567`, `+94771234567`, `94 77 123 4567`,
 * and other loosely-formatted variants. Returns `null` if the input cannot
 * be normalised into a valid Sri Lankan mobile number.
 * @param {string} input
 * @returns {string|null}
 */
export function normaliseLk(input) {
  if (typeof input !== 'string') return null;

  const digits = input.replace(/\D/g, '');
  let candidate;

  if (digits.startsWith('94') && digits.length === 11) {
    candidate = digits;
  } else if (digits.startsWith('0') && digits.length === 10) {
    candidate = `94${digits.slice(1)}`;
  } else if (digits.length === 9) {
    candidate = `94${digits}`;
  } else {
    return null;
  }

  return LK_MOBILE_PATTERN.test(candidate) ? candidate : null;
}
