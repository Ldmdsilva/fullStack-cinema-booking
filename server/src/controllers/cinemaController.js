import * as cinemaService from '../services/cinemaService.js';
import { serializeCinema, serializeCinemaSummary } from '../serializers/cinemaSerializer.js';

export async function listCinemas(req, res, next) {
  try {
    const cinemas = await cinemaService.listCinemas();
    return res.status(200).json({ items: cinemas.map(serializeCinemaSummary) });
  } catch (error) {
    next(error);
  }
}

export async function getCinema(req, res, next) {
  try {
    const cinema = await cinemaService.getCinemaById(req.params.id);
    return res.status(200).json({ cinema: serializeCinema(cinema) });
  } catch (error) {
    next(error);
  }
}

export async function createCinema(req, res, next) {
  try {
    const { name, address, city, screens } = req.body;
    const cinema = await cinemaService.createCinema({ name, address, city, screens });
    return res.status(201).json({ cinema: serializeCinema(cinema) });
  } catch (error) {
    next(error);
  }
}

export async function updateCinema(req, res, next) {
  try {
    const cinema = await cinemaService.updateCinema(req.params.id, req.body);
    return res.status(200).json({ cinema: serializeCinema(cinema) });
  } catch (error) {
    next(error);
  }
}

export async function deleteCinema(req, res, next) {
  try {
    await cinemaService.deleteCinema(req.params.id);
    return res.status(204).send();
  } catch (error) {
    next(error);
  }
}
