import { describe, it, expect, beforeAll, beforeEach, afterAll, jest } from '@jest/globals';
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import Film from '../../src/models/Film.js';
import Cinema from '../../src/models/Cinema.js';
import Showtime from '../../src/models/Showtime.js';
import { logger } from '../../src/config/logger.js';
import * as showtimeService from '../../src/services/showtimeService.js';

function buildSeatLayout(entries) {
  // entries: [{ section, row, number }] — id auto-derived as `${row}${number}`
  return entries.map((e) => ({ id: `${e.row}${e.number}`, section: e.section, row: e.row, number: e.number }));
}

async function createFilm(overrides = {}) {
  return Film.create({
    title: 'The Great Adventure',
    synopsis: 'A hero sets out on a journey.',
    certificate: 'PG',
    runtimeMinutes: 120,
    genre: ['Action'],
    releaseDate: new Date(Date.now() - 86400000),
    ...overrides,
  });
}

async function createCinema(screens) {
  return Cinema.create({
    name: 'Encore Cineplex',
    address: '10 Galle Road',
    city: 'Colombo',
    screens,
  });
}

describe('showtimeService (FR-19, FR-20, FR-21, FR-24, §C6.2)', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  describe('createShowtime — tier derivation', () => {
    it('derives seat tiers from known section names and freezes tier-multiplied prices', async () => {
      const film = await createFilm();
      const cinema = await createCinema([
        {
          screenId: '1',
          name: 'Screen 1',
          seatLayout: buildSeatLayout([
            { section: 'standard', row: 'A', number: 1 },
            { section: 'premium', row: 'B', number: 1 },
            { section: 'recliner', row: 'C', number: 1 },
          ]),
        },
      ]);

      const showtime = await showtimeService.createShowtime({
        filmRef: film._id.toString(),
        cinemaRef: cinema._id.toString(),
        screenId: '1',
        startsAt: new Date(Date.now() + 86400000),
        basePrice: 1000,
      });

      const byId = Object.fromEntries(showtime.seats.map((s) => [s.id, s]));
      expect(byId.A1.tier).toBe('STANDARD');
      expect(byId.A1.price).toBe(1000);
      expect(byId.B1.tier).toBe('PREMIUM');
      expect(byId.B1.price).toBe(1350);
      expect(byId.C1.tier).toBe('RECLINER');
      expect(byId.C1.price).toBe(1800);
      expect(showtime.screenName).toBe('Screen 1');
    });

    it('is case-insensitive when mapping section names to tiers', async () => {
      const film = await createFilm();
      const cinema = await createCinema([
        {
          screenId: '1',
          name: 'Screen 1',
          seatLayout: buildSeatLayout([{ section: 'PREMIUM', row: 'A', number: 1 }]),
        },
      ]);

      const showtime = await showtimeService.createShowtime({
        filmRef: film._id.toString(),
        cinemaRef: cinema._id.toString(),
        screenId: '1',
        startsAt: new Date(Date.now() + 86400000),
        basePrice: 1000,
      });

      expect(showtime.seats[0].tier).toBe('PREMIUM');
      expect(showtime.seats[0].price).toBe(1350);
    });

    it('defaults an unrecognised section to STANDARD and logs a warning', async () => {
      const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});

      const film = await createFilm();
      const cinema = await createCinema([
        {
          screenId: '1',
          name: 'Screen 1',
          seatLayout: buildSeatLayout([{ section: 'VIP-Lounge', row: 'A', number: 1 }]),
        },
      ]);

      const showtime = await showtimeService.createShowtime({
        filmRef: film._id.toString(),
        cinemaRef: cinema._id.toString(),
        screenId: '1',
        startsAt: new Date(Date.now() + 86400000),
        basePrice: 1000,
      });

      expect(showtime.seats[0].tier).toBe('STANDARD');
      expect(showtime.seats[0].price).toBe(1000);
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('throws FILM_NOT_FOUND when filmRef does not exist', async () => {
      const cinema = await createCinema([
        { screenId: '1', name: 'Screen 1', seatLayout: buildSeatLayout([{ section: 'standard', row: 'A', number: 1 }]) },
      ]);

      await expect(
        showtimeService.createShowtime({
          filmRef: '64b64b64b64b64b64b64b64b',
          cinemaRef: cinema._id.toString(),
          screenId: '1',
          startsAt: new Date(Date.now() + 86400000),
          basePrice: 1000,
        })
      ).rejects.toMatchObject({ statusCode: 404, code: 'FILM_NOT_FOUND' });
    });

    it('throws CINEMA_NOT_FOUND when cinemaRef does not exist', async () => {
      const film = await createFilm();

      await expect(
        showtimeService.createShowtime({
          filmRef: film._id.toString(),
          cinemaRef: '64b64b64b64b64b64b64b64b',
          screenId: '1',
          startsAt: new Date(Date.now() + 86400000),
          basePrice: 1000,
        })
      ).rejects.toMatchObject({ statusCode: 404, code: 'CINEMA_NOT_FOUND' });
    });

    it('throws SCREEN_NOT_FOUND when screenId is not on the cinema', async () => {
      const film = await createFilm();
      const cinema = await createCinema([
        { screenId: '1', name: 'Screen 1', seatLayout: buildSeatLayout([{ section: 'standard', row: 'A', number: 1 }]) },
      ]);

      await expect(
        showtimeService.createShowtime({
          filmRef: film._id.toString(),
          cinemaRef: cinema._id.toString(),
          screenId: 'nope',
          startsAt: new Date(Date.now() + 86400000),
          basePrice: 1000,
        })
      ).rejects.toMatchObject({ statusCode: 404, code: 'SCREEN_NOT_FOUND' });
    });

    it('rejects a startsAt that is in the past', async () => {
      const film = await createFilm();
      const cinema = await createCinema([
        { screenId: '1', name: 'Screen 1', seatLayout: buildSeatLayout([{ section: 'standard', row: 'A', number: 1 }]) },
      ]);

      await expect(
        showtimeService.createShowtime({
          filmRef: film._id.toString(),
          cinemaRef: cinema._id.toString(),
          screenId: '1',
          startsAt: new Date(Date.now() - 86400000),
          basePrice: 1000,
        })
      ).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    });
  });

  describe('cancelShowtime', () => {
    it('flips status to cancelled and returns the updated showtime', async () => {
      const film = await createFilm();
      const cinema = await createCinema([
        { screenId: '1', name: 'Screen 1', seatLayout: buildSeatLayout([{ section: 'standard', row: 'A', number: 1 }]) },
      ]);
      const created = await showtimeService.createShowtime({
        filmRef: film._id.toString(),
        cinemaRef: cinema._id.toString(),
        screenId: '1',
        startsAt: new Date(Date.now() + 86400000),
        basePrice: 1000,
      });

      const cancelled = await showtimeService.cancelShowtime(created.id);
      expect(cancelled.status).toBe('cancelled');

      const stored = await Showtime.findById(created.id);
      expect(stored.status).toBe('cancelled');
    });

    it('throws SHOWTIME_NOT_FOUND for a non-existent showtime', async () => {
      await expect(showtimeService.cancelShowtime('64b64b64b64b64b64b64b64b')).rejects.toMatchObject({
        statusCode: 404,
        code: 'SHOWTIME_NOT_FOUND',
      });
    });
  });

  describe('getShowtimeById', () => {
    it('throws SHOWTIME_NOT_FOUND for a non-existent showtime', async () => {
      await expect(showtimeService.getShowtimeById('64b64b64b64b64b64b64b64b')).rejects.toMatchObject({
        statusCode: 404,
        code: 'SHOWTIME_NOT_FOUND',
      });
    });
  });

  describe('listShowtimes — filtering and pagination', () => {
    async function seedShowtimes() {
      const film1 = await createFilm({ title: 'Film One' });
      const film2 = await createFilm({ title: 'Film Two' });
      const cinema1 = await createCinema([
        { screenId: '1', name: 'Screen 1', seatLayout: buildSeatLayout([{ section: 'standard', row: 'A', number: 1 }]) },
      ]);
      const cinema2 = await createCinema([
        { screenId: '1', name: 'Screen 1', seatLayout: buildSeatLayout([{ section: 'standard', row: 'A', number: 1 }]) },
      ]);

      for (let i = 0; i < 3; i++) {
        await showtimeService.createShowtime({
          filmRef: film1._id.toString(),
          cinemaRef: cinema1._id.toString(),
          screenId: '1',
          startsAt: new Date(Date.now() + 86400000 * (i + 1)),
          basePrice: 1000,
        });
      }
      await showtimeService.createShowtime({
        filmRef: film2._id.toString(),
        cinemaRef: cinema2._id.toString(),
        screenId: '1',
        startsAt: new Date(Date.now() + 86400000 * 5),
        basePrice: 1000,
      });

      return { film1, film2, cinema1, cinema2 };
    }

    it('paginates with the standardized {items, total, page, limit, totalPages} envelope', async () => {
      await seedShowtimes();

      const result = await showtimeService.listShowtimes({ page: 1, limit: 2 });
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(4);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(2);
      expect(result.totalPages).toBe(2);
    });

    it('clamps page to a minimum of 1 and limit between 1 and 100', async () => {
      await seedShowtimes();
      const result = await showtimeService.listShowtimes({ page: 0, limit: 1000 });
      expect(result.page).toBe(1);
      expect(result.limit).toBe(100);
    });

    it('filters by filmId', async () => {
      const { film1 } = await seedShowtimes();
      const result = await showtimeService.listShowtimes({ filmId: film1._id.toString() });
      expect(result.total).toBe(3);
      expect(result.items.every((s) => s.film.id === film1._id.toString())).toBe(true);
    });

    it('filters by cinemaId', async () => {
      const { cinema2 } = await seedShowtimes();
      const result = await showtimeService.listShowtimes({ cinemaId: cinema2._id.toString() });
      expect(result.total).toBe(1);
    });

    it('excludes past showtimes by default', async () => {
      const { film1, cinema1 } = await seedShowtimes();
      await Showtime.create({
        filmRef: film1._id,
        cinemaRef: cinema1._id,
        screenId: '1',
        screenName: 'Screen 1',
        startsAt: new Date(Date.now() - 86400000),
        basePrice: 1000,
        seats: [{ id: 'A1', section: 'standard', row: 'A', number: 1, tier: 'STANDARD', price: 1000, status: 'available' }],
        status: 'scheduled',
      });

      const result = await showtimeService.listShowtimes({});
      expect(result.total).toBe(4);
    });

    it('never lists cancelled showtimes', async () => {
      const { film1, cinema1 } = await seedShowtimes();
      const created = await showtimeService.createShowtime({
        filmRef: film1._id.toString(),
        cinemaRef: cinema1._id.toString(),
        screenId: '1',
        startsAt: new Date(Date.now() + 86400000 * 10),
        basePrice: 1000,
      });
      await showtimeService.cancelShowtime(created.id);

      const result = await showtimeService.listShowtimes({});
      expect(result.total).toBe(4);
    });
  });
});
