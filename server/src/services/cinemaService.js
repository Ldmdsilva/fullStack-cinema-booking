import Cinema from '../models/Cinema.js';
// Forward reference: a later phase of this same migration introduces
// `server/src/models/Showtime.js` (§C6.2 Showtime). If this file does not
// exist yet at the time this module is loaded, importing it here will throw
// ERR_MODULE_NOT_FOUND — an expected transient state of an additive,
// multi-phase migration, not a bug in this file. Once that phase lands, this
// resolves and `deleteCinema()` behaves exactly like `deleteVenue()` does for
// `Event`.
import Showtime from '../models/Showtime.js';
import { AppError } from '../middleware/errorHandler.js';
import { MAX_SEATS_PER_SCREEN } from '../config/seatTiers.js';

/**
 * Retrieve all cinemas (FR-23). Not paginated — mirrors `venueService`'s
 * `getAllVenues()`: cinemas are a small, admin-curated catalogue (unlike
 * films/showtimes, which the SRS explicitly paginates with
 * `{items,total,page,limit}`), so a flat list keeps this simpler. The
 * `{items}` response envelope (§C7.1) is applied at the controller layer.
 * @returns {Promise<Array>}
 */
export async function listCinemas() {
  const cinemas = await Cinema.find().sort({ name: 1 });
  return cinemas;
}

/**
 * Retrieve a single cinema by ID (FR-23)
 * @param {string} id
 * @returns {Promise<object>}
 */
export async function getCinemaById(id) {
  const cinema = await Cinema.findById(id);
  if (!cinema) {
    throw new AppError('Cinema not found', 404, 'CINEMA_NOT_FOUND');
  }
  return cinema;
}

/**
 * Validate that every screen's seat layout is within the per-screen cap
 * (§C6.2, ADR-002 action 1). Throws a friendlier 400 before the write hits
 * the DB, mirroring `venueService.createVenue`'s explicit pre-check ahead of
 * the schema validator.
 * @param {Array} screens
 */
function assertScreenCapacities(screens) {
  if (!Array.isArray(screens) || screens.length === 0) {
    throw new AppError('At least one screen is required', 400, 'VALIDATION_ERROR');
  }

  for (const screen of screens) {
    if (!screen || !Array.isArray(screen.seatLayout) || screen.seatLayout.length === 0) {
      throw new AppError('Each screen must have a non-empty seat layout', 400, 'VALIDATION_ERROR');
    }
    if (screen.seatLayout.length > MAX_SEATS_PER_SCREEN) {
      throw new AppError(
        `Screen seat layout must contain between 1 and ${MAX_SEATS_PER_SCREEN} seats`,
        400,
        'CAPACITY_EXCEEDED'
      );
    }
  }

  const screenIds = screens.map((s) => s.screenId);
  if (new Set(screenIds).size !== screenIds.length) {
    throw new AppError('Screen IDs must be unique within a cinema', 400, 'VALIDATION_ERROR');
  }
}

/**
 * Create a new cinema with one or more screens (FR-23, §C6.2)
 * @param {object} cinemaData
 * @param {string} cinemaData.name
 * @param {string} cinemaData.address
 * @param {string} cinemaData.city
 * @param {Array} cinemaData.screens
 * @returns {Promise<object>}
 */
export async function createCinema({ name, address, city, screens }) {
  if (!name || !address || !city || !screens) {
    throw new AppError('Name, address, city, and screens are required', 400, 'VALIDATION_ERROR');
  }

  assertScreenCapacities(screens);

  const cinema = await Cinema.create({
    name: name.trim(),
    address: address.trim(),
    city: city.trim(),
    screens: screens.map((screen) => ({
      screenId: screen.screenId,
      name: screen.name,
      seatLayout: screen.seatLayout,
      capacity: screen.seatLayout.length,
    })),
  });

  return cinema;
}

/**
 * Update an existing cinema (FR-23). Re-validates screen seat-layout caps
 * when `screens` is part of the update, same pattern as `venueService.updateVenue`.
 * @param {string} id
 * @param {object} updateData
 * @returns {Promise<object>}
 */
export async function updateCinema(id, updateData) {
  if (updateData.screens) {
    assertScreenCapacities(updateData.screens);
    updateData.screens = updateData.screens.map((screen) => ({
      screenId: screen.screenId,
      name: screen.name,
      seatLayout: screen.seatLayout,
      capacity: screen.seatLayout.length,
    }));
  }

  const cinema = await Cinema.findByIdAndUpdate(id, updateData, {
    returnDocument: 'after',
    runValidators: true,
  });

  if (!cinema) {
    throw new AppError('Cinema not found', 404, 'CINEMA_NOT_FOUND');
  }

  return cinema;
}

/**
 * Delete a cinema (FR-23). Blocks deletion if any showtime references it
 * (§C6.2/§C7.1 `DELETE /api/cinemas/:id` -> 409 when showtimes reference it),
 * mirroring `venueService.deleteVenue`'s `VENUE_IN_USE` guard.
 * @param {string} id
 */
export async function deleteCinema(id) {
  const cinema = await Cinema.findById(id);
  if (!cinema) {
    throw new AppError('Cinema not found', 404, 'CINEMA_NOT_FOUND');
  }

  const referencingShowtimesCount = await Showtime.countDocuments({ cinemaRef: id });

  if (referencingShowtimesCount > 0) {
    throw new AppError(
      'Cannot delete cinema because one or more showtimes reference it',
      409,
      'CINEMA_IN_USE',
      { referencingShowtimesCount }
    );
  }

  await Cinema.findByIdAndDelete(id);
}

/**
 * Look up a specific screen within a cinema by its `screenId` (§C6.2).
 * Exposed so a later phase's `showtimeService` can resolve a screen's seat
 * layout by `cinemaRef` + `screenId` without duplicating this lookup.
 * @param {object} cinema - a Cinema document (or plain object with `screens`)
 * @param {string} screenId
 * @returns {object} the matching screen sub-document
 */
export function getScreen(cinema, screenId) {
  const screen = cinema?.screens?.find((s) => s.screenId === screenId);
  if (!screen) {
    throw new AppError('Screen not found', 404, 'SCREEN_NOT_FOUND');
  }
  return screen;
}
