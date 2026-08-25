import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import Film from '../../src/models/Film.js';

let filmService;
let Showtime;

describe('services/filmService.js', () => {
  beforeAll(async () => {
    await connectTestDB();
    filmService = await import('../../src/services/filmService.js');
    // Used only by the "blocked by referencing showtime" test below. The
    // Showtime model is added by a later phase of this same migration; if
    // it doesn't exist yet, the dynamic import above will already have
    // thrown before we get here.
    Showtime = (await import('../../src/models/Showtime.js')).default;
  });

  afterAll(async () => {
    await closeTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  function makeFilmData(overrides = {}) {
    return {
      title: 'The Great Adventure',
      synopsis: 'A hero sets out on a journey.',
      certificate: 'PG',
      runtimeMinutes: 120,
      genre: ['Action', 'Adventure'],
      posterUrl: 'https://example.com/poster.jpg',
      releaseDate: new Date(Date.now() + 86400000 * 30),
      ...overrides,
    };
  }

  describe('createFilm', () => {
    it('creates a film with valid data', async () => {
      const film = await filmService.createFilm(makeFilmData());
      expect(film.title).toBe('The Great Adventure');
      expect(film.genre).toEqual(['Action', 'Adventure']);
      expect(film.certificate).toBe('PG');
    });

    it('rejects missing required fields with 400 VALIDATION_ERROR', async () => {
      await expect(filmService.createFilm(makeFilmData({ title: undefined }))).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('rejects an empty genre array with 400 VALIDATION_ERROR', async () => {
      await expect(filmService.createFilm(makeFilmData({ genre: [] }))).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });
  });

  describe('listFilms', () => {
    beforeEach(async () => {
      await filmService.createFilm(makeFilmData({ title: 'Action Movie', genre: ['Action'] }));
      await filmService.createFilm(makeFilmData({ title: 'Comedy Movie', genre: ['Comedy'] }));
      await filmService.createFilm(makeFilmData({ title: 'Another Action Flick', genre: ['Action', 'Thriller'] }));
    });

    it('paginates results using the standardized {items, total, page, limit, totalPages} envelope', async () => {
      const result = await filmService.listFilms({ page: 1, limit: 2 });
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(3);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(2);
      expect(result.totalPages).toBe(2);
    });

    it('clamps page to a minimum of 1 and limit between 1 and 100', async () => {
      const result = await filmService.listFilms({ page: 0, limit: 1000 });
      expect(result.page).toBe(1);
      expect(result.limit).toBe(100);
    });

    it('filters by genre (array-contains match)', async () => {
      const result = await filmService.listFilms({ genre: 'Action' });
      expect(result.total).toBe(2);
      expect(result.items.every((f) => f.genre.includes('Action'))).toBe(true);
    });

    it('filters using the text index when search is provided', async () => {
      const result = await filmService.listFilms({ search: 'Comedy' });
      expect(result.total).toBe(1);
      expect(result.items[0].title).toBe('Comedy Movie');
    });
  });

  describe('getFilmById', () => {
    it('returns the film when found', async () => {
      const created = await filmService.createFilm(makeFilmData());
      const found = await filmService.getFilmById(created._id.toString());
      expect(found.title).toBe(created.title);
    });

    it('throws 404 FILM_NOT_FOUND when the film does not exist', async () => {
      await expect(filmService.getFilmById('64b64b64b64b64b64b64b64b')).rejects.toMatchObject({
        statusCode: 404,
        code: 'FILM_NOT_FOUND',
      });
    });
  });

  describe('updateFilm', () => {
    it('updates fields and returns the updated document', async () => {
      const created = await filmService.createFilm(makeFilmData());
      const updated = await filmService.updateFilm(created._id.toString(), { title: 'Updated Title' });
      expect(updated.title).toBe('Updated Title');
    });

    it('throws 404 FILM_NOT_FOUND when updating a non-existent film', async () => {
      await expect(
        filmService.updateFilm('64b64b64b64b64b64b64b64b', { title: 'Nope' })
      ).rejects.toMatchObject({ statusCode: 404, code: 'FILM_NOT_FOUND' });
    });
  });

  describe('deleteFilm', () => {
    it('deletes a film with no referencing showtimes', async () => {
      const created = await filmService.createFilm(makeFilmData());
      await filmService.deleteFilm(created._id.toString());
      const found = await Film.findById(created._id);
      expect(found).toBeNull();
    });

    it('throws 404 FILM_NOT_FOUND when deleting a non-existent film', async () => {
      await expect(filmService.deleteFilm('64b64b64b64b64b64b64b64b')).rejects.toMatchObject({
        statusCode: 404,
        code: 'FILM_NOT_FOUND',
      });
    });

    it('blocks deletion with 409 FILM_IN_USE when a showtime references the film', async () => {
      const created = await filmService.createFilm(makeFilmData());

      // Minimal fixture — only the fields filmService's reference-check
      // query needs. The Showtime model itself is owned by a later phase
      // of this migration; if its schema evolves, this fixture may need
      // to grow accordingly.
      await Showtime.create({
        filmRef: created._id,
        cinemaRef: created._id, // placeholder ObjectId; not validated by the reference-check
        screenId: 'screen-1',
        screenName: 'Screen 1',
        startsAt: new Date(Date.now() + 86400000),
        basePrice: 10,
        seats: [],
        status: 'scheduled',
      });

      await expect(filmService.deleteFilm(created._id.toString())).rejects.toMatchObject({
        statusCode: 409,
        code: 'FILM_IN_USE',
      });

      const stillExists = await Film.findById(created._id);
      expect(stillExists).not.toBeNull();
    });
  });
});
