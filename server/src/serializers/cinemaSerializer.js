/**
 * Serialize a Cinema document (or plain object) into the full admin/detail
 * API shape, including every screen and its full seat layout.
 * @param {object} cinema
 * @returns {object}
 */
export function serializeCinema(cinema) {
  if (!cinema) return null;
  const obj = typeof cinema.toJSON === 'function' ? cinema.toJSON() : cinema;

  return {
    id: (obj.id ?? obj._id)?.toString(),
    name: obj.name,
    address: obj.address,
    city: obj.city,
    screens: (obj.screens || []).map((screen) => ({
      screenId: screen.screenId,
      name: screen.name,
      capacity: screen.capacity,
      seatLayout: screen.seatLayout,
    })),
  };
}

/**
 * Serialize a Cinema down to the lighter shape used in list views — no
 * per-screen seat layouts, since a listing has no need to drag up to
 * `MAX_SEATS_PER_SCREEN` (300) seats per screen over the wire (mirrors the
 * same principle applied to showtime listings vs `GET /api/showtimes/:id`).
 * @param {object} cinema
 * @returns {{ id: string, name: string, address: string, city: string, screenCount: number, totalCapacity: number } | null}
 */
export function serializeCinemaSummary(cinema) {
  if (!cinema) return null;
  const obj = typeof cinema.toJSON === 'function' ? cinema.toJSON() : cinema;
  const screens = obj.screens || [];

  return {
    id: (obj.id ?? obj._id)?.toString(),
    name: obj.name,
    address: obj.address,
    city: obj.city,
    screenCount: screens.length,
    totalCapacity: screens.reduce((sum, screen) => sum + (screen.capacity || 0), 0),
  };
}
