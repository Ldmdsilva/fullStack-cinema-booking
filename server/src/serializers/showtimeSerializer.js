/**
 * FR-31 choke point (ADR-012 action 4 / NFR-14). An expired hold must read
 * as `available` regardless of whether the sweeper has processed it yet —
 * seat state is NEVER cached (NFR-15b), so every read derives it live.
 *
 * Every function anywhere in this codebase that reads a showtime seat's
 * status — now or in any later phase — MUST funnel through this function
 * rather than reading `seat.status` directly.
 * @param {object} seat - a showtime seat sub-document (or plain object)
 * @param {Date} [now]
 * @returns {'available'|'held'|'booked'}
 */
export function effectiveSeatStatus(seat, now = new Date()) {
  if (seat.status === 'held' && seat.holdExpiresAt && seat.holdExpiresAt <= now) return 'available';
  return seat.status;
}

/**
 * Serialize a populated-or-not `filmRef` down to the compact shape embedded
 * in showtime listings with populate-tolerant handling: works whether Mongoose
 * has populated the ref (returning the full Film document) or left it as a
 * raw ObjectId string.
 * @param {object|string} film
 * @returns {{id:string,title?:string,posterUrl?:string,certificate?:string,runtimeMinutes?:number}|null}
 */
function serializeFilmRef(film) {
  if (!film) return null;
  // Unpopulated ref: an ObjectId (or its string form) with no catalogue fields.
  if (typeof film === 'string' || !film.title) {
    return { id: film.toString() };
  }
  const obj = typeof film.toJSON === 'function' ? film.toJSON() : film;
  return {
    id: (obj.id ?? obj._id)?.toString(),
    title: obj.title,
    posterUrl: obj.posterUrl,
    certificate: obj.certificate,
    runtimeMinutes: obj.runtimeMinutes,
  };
}

/**
 * Serialize a populated-or-not `cinemaRef` down to the compact shape
 * embedded in showtime listings. Never includes `screens` — a listing must
 * never drag up to 300 seats per screen over the wire.
 * @param {object|string} cinema
 * @returns {{id:string,name?:string,city?:string}|null}
 */
function serializeCinemaRef(cinema) {
  if (!cinema) return null;
  if (typeof cinema === 'string' || !cinema.name) {
    return { id: cinema.toString() };
  }
  const obj = typeof cinema.toJSON === 'function' ? cinema.toJSON() : cinema;
  return {
    id: (obj.id ?? obj._id)?.toString(),
    name: obj.name,
    city: obj.city,
  };
}

/**
 * Serialize a Showtime document into the list-view summary shape (FR-19–21).
 * `availableSeats` is derived through `effectiveSeatStatus`, never from the
 * raw stored `seat.status` — this is the whole point of the FR-31 choke
 * point: an expired-but-unswept hold must count as available.
 * @param {object} showtime
 * @param {Date} [now]
 * @returns {object|null}
 */
export function serializeShowtimeSummary(showtime, now = new Date()) {
  if (!showtime) return null;
  const obj = typeof showtime.toJSON === 'function' ? showtime.toJSON() : showtime;
  const seats = obj.seats || [];

  return {
    id: (obj.id ?? obj._id)?.toString(),
    film: serializeFilmRef(obj.filmRef),
    cinema: serializeCinemaRef(obj.cinemaRef),
    screenName: obj.screenName,
    startsAt: obj.startsAt,
    basePrice: obj.basePrice,
    status: obj.status,
    totalSeats: seats.length,
    availableSeats: seats.filter((s) => effectiveSeatStatus(s, now) === 'available').length,
  };
}

/**
 * Serialize a Showtime document into the detail shape (FR-20, FR-26): the
 * summary fields plus the full per-seat array, with each seat's `status`
 * derived through `effectiveSeatStatus`. Deliberately omits `holdExpiresAt`
 * and `holdRef` — internal bookkeeping the client should never reason about
 * directly, only the derived `status`.
 * @param {object} showtime
 * @param {Date} [now]
 * @returns {object|null}
 */
export function serializeShowtimeDetail(showtime, now = new Date()) {
  if (!showtime) return null;
  const obj = typeof showtime.toJSON === 'function' ? showtime.toJSON() : showtime;
  const seats = obj.seats || [];

  return {
    ...serializeShowtimeSummary(showtime, now),
    seats: seats.map((seat) => ({
      id: seat.id,
      section: seat.section,
      row: seat.row,
      number: seat.number,
      tier: seat.tier,
      price: seat.price,
      status: effectiveSeatStatus(seat, now),
    })),
  };
}
