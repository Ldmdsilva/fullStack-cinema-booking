import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import * as cinemaService from '../../src/services/cinemaService.js';
// Statically imported, matching the same forward-reference this phase's plan
// specifies for `server/src/services/cinemaService.js` itself: a later phase
// of this migration introduces `server/src/models/Showtime.js` (§C6.2). If
// that file does not exist yet, this import throws at module-load time and
// this whole test file fails to run — an expected, transient state of an
// additive multi-phase migration (see the CINEMA_IN_USE test below), not a
// bug in this test or in cinemaService.js. It will start passing with no
// changes needed here the moment that model file lands.
import Showtime from '../../src/models/Showtime.js';

function buildSeatLayout(count, prefix = 'A') {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i + 1}`,
    section: 'STANDARD',
    row: prefix,
    number: i + 1,
  }));
}

describe('cinemaService Unit Tests (FR-23, §C6.2)', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  it('FR-23: creates a cinema with multiple screens and computes each screen capacity', async () => {
    const cinema = await cinemaService.createCinema({
      name: 'Encore Cineplex',
      address: '10 Galle Road',
      city: 'Colombo',
      screens: [
        { screenId: '1', name: 'Screen 1', seatLayout: buildSeatLayout(3, 'A') },
        { screenId: 'IMAX', name: 'IMAX Screen', seatLayout: buildSeatLayout(2, 'B') },
      ],
    });

    expect(cinema._id).toBeDefined();
    expect(cinema.name).toBe('Encore Cineplex');
    expect(cinema.city).toBe('Colombo');
    expect(cinema.screens).toHaveLength(2);
    expect(cinema.screens[0].capacity).toBe(3);
    expect(cinema.screens[1].capacity).toBe(2);
  });

  it('FR-23: rejects cinema creation with a missing city (400 VALIDATION_ERROR)', async () => {
    await expect(
      cinemaService.createCinema({
        name: 'No City Cinema',
        address: '1 Nowhere Road',
        screens: [{ screenId: '1', name: 'Screen 1', seatLayout: buildSeatLayout(1) }],
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('FR-23/ADR-002: rejects creation when a screen exceeds 300 seats (CAPACITY_EXCEEDED)', async () => {
    const oversizedLayout = buildSeatLayout(301);

    await expect(
      cinemaService.createCinema({
        name: 'Giant Cinema',
        address: '99 Big Ave',
        city: 'Kandy',
        screens: [{ screenId: '1', name: 'Mega Screen', seatLayout: oversizedLayout }],
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'CAPACITY_EXCEEDED',
    });
  });

  it('FR-23: rejects creation with duplicate screenIds within the same cinema', async () => {
    await expect(
      cinemaService.createCinema({
        name: 'Dup Screen Cinema',
        address: '5 Duplicate Lane',
        city: 'Galle',
        screens: [
          { screenId: '1', name: 'Screen 1', seatLayout: buildSeatLayout(2, 'A') },
          { screenId: '1', name: 'Screen 1 Again', seatLayout: buildSeatLayout(2, 'B') },
        ],
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('FR-23: fetches a cinema by ID and returns 404 CINEMA_NOT_FOUND for a missing one', async () => {
    const created = await cinemaService.createCinema({
      name: 'Findable Cinema',
      address: '7 Lookup Street',
      city: 'Jaffna',
      screens: [{ screenId: '1', name: 'Screen 1', seatLayout: buildSeatLayout(1) }],
    });

    const found = await cinemaService.getCinemaById(created._id);
    expect(found.name).toBe('Findable Cinema');

    const all = await cinemaService.listCinemas();
    expect(all.length).toBeGreaterThanOrEqual(1);

    const missingId = '64b64c1f2f8fb814b56fa181';
    await expect(cinemaService.getCinemaById(missingId)).rejects.toMatchObject({
      statusCode: 404,
      code: 'CINEMA_NOT_FOUND',
    });
  });

  it('FR-23: updates an existing cinema, re-validating screen caps on update', async () => {
    const created = await cinemaService.createCinema({
      name: 'Updatable Cinema',
      address: '3 Change Street',
      city: 'Negombo',
      screens: [{ screenId: '1', name: 'Screen 1', seatLayout: buildSeatLayout(2) }],
    });

    const updated = await cinemaService.updateCinema(created._id, { name: 'Renamed Cinema' });
    expect(updated.name).toBe('Renamed Cinema');

    await expect(
      cinemaService.updateCinema(created._id, {
        screens: [{ screenId: '1', name: 'Screen 1', seatLayout: buildSeatLayout(301) }],
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'CAPACITY_EXCEEDED',
    });
  });

  it('FR-23: getScreen returns the matching screen and throws SCREEN_NOT_FOUND otherwise', async () => {
    const cinema = await cinemaService.createCinema({
      name: 'Screen Lookup Cinema',
      address: '2 Auditorium Ave',
      city: 'Matara',
      screens: [
        { screenId: '1', name: 'Screen 1', seatLayout: buildSeatLayout(2, 'A') },
        { screenId: '2', name: 'Screen 2', seatLayout: buildSeatLayout(2, 'B') },
      ],
    });

    const screen = cinemaService.getScreen(cinema, '2');
    expect(screen.name).toBe('Screen 2');

    expect(() => cinemaService.getScreen(cinema, 'nope')).toThrow(
      expect.objectContaining({ statusCode: 404, code: 'SCREEN_NOT_FOUND' })
    );
  });

  it('FR-23: successfully deletes an unreferenced cinema', async () => {
    const cinema = await cinemaService.createCinema({
      name: 'Empty Cinema',
      address: '1 Solitary Lane',
      city: 'Trincomalee',
      screens: [{ screenId: '1', name: 'Screen 1', seatLayout: buildSeatLayout(1) }],
    });

    await cinemaService.deleteCinema(cinema._id);
    await expect(cinemaService.getCinemaById(cinema._id)).rejects.toMatchObject({
      statusCode: 404,
      code: 'CINEMA_NOT_FOUND',
    });
  });

  it('FR-23: prevents cinema deletion when showtimes reference it (409 CINEMA_IN_USE)', async () => {
    const cinema = await cinemaService.createCinema({
      name: 'Busy Cinema',
      address: '22 Broadway',
      city: 'Colombo',
      screens: [{ screenId: '1', name: 'Screen 1', seatLayout: buildSeatLayout(1) }],
    });

    await Showtime.create({
      filmRef: '64b64c1f2f8fb814b56fa181',
      cinemaRef: cinema._id,
      screenId: '1',
      screenName: 'Screen 1',
      startsAt: new Date(Date.now() + 86400000),
      basePrice: 500,
      seats: [{ id: 'A-1', row: 'A', number: 1, section: 'STANDARD', tier: 'STANDARD', status: 'available', price: 500 }],
      status: 'scheduled',
    });

    await expect(cinemaService.deleteCinema(cinema._id)).rejects.toMatchObject({
      statusCode: 409,
      code: 'CINEMA_IN_USE',
    });
  });
});
