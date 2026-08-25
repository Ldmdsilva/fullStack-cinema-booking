import * as showtimeService from '../services/showtimeService.js';

export async function listShowtimes(req, res, next) {
  try {
    const result = await showtimeService.listShowtimes(req.query);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getShowtime(req, res, next) {
  try {
    // §C7.1 documents this endpoint as `{showtime, seats[]}` sibling keys
    // (matching the legacy Event `{event, seats}` shape), not seats nested
    // inside `showtime` — split the serializer's combined detail shape here.
    const { seats, ...showtime } = await showtimeService.getShowtimeById(req.params.id);
    return res.status(200).json({ showtime, seats });
  } catch (error) {
    next(error);
  }
}

export async function createShowtime(req, res, next) {
  try {
    const { filmRef, cinemaRef, screenId, startsAt, basePrice } = req.body;
    const showtime = await showtimeService.createShowtime({
      filmRef,
      cinemaRef,
      screenId,
      startsAt,
      basePrice,
    });
    return res.status(201).json({ showtime });
  } catch (error) {
    next(error);
  }
}

export async function cancelShowtime(req, res, next) {
  try {
    const showtime = await showtimeService.cancelShowtime(req.params.id);
    return res.status(200).json({ showtime });
  } catch (error) {
    next(error);
  }
}
