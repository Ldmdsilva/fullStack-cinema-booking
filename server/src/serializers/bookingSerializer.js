/**
 * Serialize a Booking document into the public API shape.
 * `showtimeRef`/`userRef` may be a populated document, a bare ObjectId, or
 * absent — the serializer degrades to just the id string in that case.
 * @param {object} booking
 * @returns {object}
 */
export function serializeBooking(booking) {
  if (!booking) return null;
  const obj = typeof booking.toJSON === 'function' ? booking.toJSON() : booking;

  return {
    id: (obj.id ?? obj._id)?.toString(),
    reference: obj.reference,
    userId: serializeRefId(obj.userRef),
    user: serializePopulatedUser(obj.userRef),
    showtime: serializePopulatedShowtime(obj.showtimeRef),
    seats: (obj.seats || []).map((seat) => ({
      id: seat.id,
      section: seat.section,
      row: seat.row,
      number: seat.number,
      price: seat.price,
    })),
    totalPrice: obj.totalPrice,
    status: obj.status,
    // Payment facts (ADR-014) — always server-verified, never client-supplied.
    paymentIntentId: obj.paymentIntentId ?? null,
    paymentStatus: obj.paymentStatus ?? null,
    createdAt: obj.createdAt,
  };
}

function serializeRefId(ref) {
  if (!ref) return null;
  if (typeof ref === 'object' && (ref._id || ref.id)) {
    return (ref.id ?? ref._id).toString();
  }
  return ref.toString();
}

function serializePopulatedUser(userRef) {
  if (!userRef || typeof userRef !== 'object' || !userRef.name) return null;
  return {
    id: serializeRefId(userRef),
    name: userRef.name,
    email: userRef.email,
  };
}

/**
 * Tolerant of a populated `showtimeRef` doc, a bare ObjectId, or absent —
 * same degrade-to-null-when-unpopulated pattern as `serializePopulatedUser`
 * above. Doesn't require nested Film/Cinema population; only reports what's
 * actually available on the Showtime document itself.
 * @param {object} showtimeRef
 * @returns {object|null}
 */
function serializePopulatedShowtime(showtimeRef) {
  if (!showtimeRef || typeof showtimeRef !== 'object' || !showtimeRef.screenName) return null;
  return {
    id: serializeRefId(showtimeRef),
    screenName: showtimeRef.screenName,
    startsAt: showtimeRef.startsAt,
  };
}
