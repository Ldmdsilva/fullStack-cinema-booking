import Film from '../models/Film.js';
import Showtime from '../models/Showtime.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Retrieve films with pagination, genre filtering, and free-text search (FR-21)
 * @param {object} queryParams
 * @returns {Promise<{ items: Array, total: number, page: number, limit: number, totalPages: number }>}
 */
export async function listFilms(queryParams = {}) {
  const { page = 1, limit = 20, genre, search } = queryParams;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const filter = {};

  if (genre) {
    filter.genre = genre;
  }

  if (search) {
    filter.$text = { $search: search };
  }

  const [items, total] = await Promise.all([
    Film.find(filter)
      .sort({ releaseDate: -1 })
      .skip(skip)
      .limit(limitNum),
    Film.countDocuments(filter),
  ]);

  return {
    items,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum),
  };
}

/**
 * Retrieve a single film by id
 * @param {string} id
 * @returns {Promise<object>}
 */
export async function getFilmById(id) {
  const film = await Film.findById(id);
  if (!film) {
    throw new AppError('Film not found', 404, 'FILM_NOT_FOUND');
  }

  return film;
}

/**
 * Create a new film (catalogue metadata only — not tied to a showtime)
 * @param {object} filmData
 * @returns {Promise<object>}
 */
export async function createFilm({ title, synopsis, certificate, runtimeMinutes, genre, posterUrl, releaseDate }) {
  if (!title || !synopsis || !certificate || runtimeMinutes === undefined || !genre || !releaseDate) {
    throw new AppError(
      'Title, synopsis, certificate, runtimeMinutes, genre, and releaseDate are required',
      400,
      'VALIDATION_ERROR'
    );
  }

  if (!Array.isArray(genre) || genre.length === 0) {
    throw new AppError('Genre must be a non-empty array', 400, 'VALIDATION_ERROR', {
      field: 'genre',
    });
  }

  const parsedReleaseDate = new Date(releaseDate);
  if (isNaN(parsedReleaseDate.getTime())) {
    throw new AppError('Invalid releaseDate format', 400, 'VALIDATION_ERROR');
  }

  const film = await Film.create({
    title: title.trim(),
    synopsis: synopsis.trim(),
    certificate,
    runtimeMinutes: Number(runtimeMinutes),
    genre: genre.map((g) => (typeof g === 'string' ? g.trim() : g)),
    posterUrl: posterUrl?.trim(),
    releaseDate: parsedReleaseDate,
  });

  return film;
}

/**
 * Update an existing film
 * @param {string} id
 * @param {object} updateData
 * @returns {Promise<object>}
 */
export async function updateFilm(id, updateData) {
  const safeUpdates = { ...updateData };

  if (safeUpdates.releaseDate) {
    const parsedReleaseDate = new Date(safeUpdates.releaseDate);
    if (isNaN(parsedReleaseDate.getTime())) {
      throw new AppError('Invalid releaseDate format', 400, 'VALIDATION_ERROR');
    }
    safeUpdates.releaseDate = parsedReleaseDate;
  }

  const film = await Film.findByIdAndUpdate(id, safeUpdates, {
    returnDocument: 'after',
    runValidators: true,
  });

  if (!film) {
    throw new AppError('Film not found', 404, 'FILM_NOT_FOUND');
  }

  return film;
}

/**
 * Delete a film, guarding against showtimes that still reference it
 * @param {string} id
 */
export async function deleteFilm(id) {
  const film = await Film.findById(id);
  if (!film) {
    throw new AppError('Film not found', 404, 'FILM_NOT_FOUND');
  }

  const referencingShowtimesCount = await Showtime.countDocuments({ filmRef: id });
  if (referencingShowtimesCount > 0) {
    throw new AppError(
      'Cannot delete film because one or more showtimes reference it',
      409,
      'FILM_IN_USE',
      { referencingShowtimesCount }
    );
  }

  await Film.deleteOne({ _id: id });
}
