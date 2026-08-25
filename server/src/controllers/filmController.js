import * as filmService from '../services/filmService.js';
import { serializeFilm } from '../serializers/filmSerializer.js';

export async function listFilms(req, res, next) {
  try {
    const result = await filmService.listFilms(req.query);
    return res.status(200).json({ ...result, items: result.items.map(serializeFilm) });
  } catch (error) {
    next(error);
  }
}

export async function getFilm(req, res, next) {
  try {
    const film = await filmService.getFilmById(req.params.id);
    return res.status(200).json({ film: serializeFilm(film) });
  } catch (error) {
    next(error);
  }
}

export async function createFilm(req, res, next) {
  try {
    const { title, synopsis, certificate, runtimeMinutes, genre, posterUrl, releaseDate } = req.body;
    const film = await filmService.createFilm({
      title,
      synopsis,
      certificate,
      runtimeMinutes,
      genre,
      posterUrl,
      releaseDate,
    });
    return res.status(201).json({ film: serializeFilm(film) });
  } catch (error) {
    next(error);
  }
}

export async function updateFilm(req, res, next) {
  try {
    const film = await filmService.updateFilm(req.params.id, req.body);
    return res.status(200).json({ film: serializeFilm(film) });
  } catch (error) {
    next(error);
  }
}

export async function deleteFilm(req, res, next) {
  try {
    await filmService.deleteFilm(req.params.id);
    return res.status(204).send();
  } catch (error) {
    next(error);
  }
}
