import * as bookingService from '../services/bookingService.js';
import * as confirmService from '../services/confirmService.js';
import { serializeBooking } from '../serializers/bookingSerializer.js';

export async function getBookingById(req, res, next) {
  try {
    const booking = await bookingService.getBookingById({
      bookingId: req.params.id,
      userId: req.user.id,
      role: req.user.role,
    });
    return res.status(200).json({ booking: serializeBooking(booking) });
  } catch (error) {
    next(error);
  }
}

export async function cancelBooking(req, res, next) {
  try {
    const booking = await bookingService.cancelBooking({
      userId: req.user.id,
      bookingId: req.params.id,
      role: req.user.role,
    });
    return res.status(200).json({ booking: serializeBooking(booking) });
  } catch (error) {
    next(error);
  }
}

export async function getMyBookings(req, res, next) {
  try {
    const result = await bookingService.getUserBookings(req.user.id, req.query);
    return res.status(200).json({ ...result, items: result.items.map(serializeBooking) });
  } catch (error) {
    next(error);
  }
}

// Showtime/Hold domain (ADR-014, §C7.1)

export async function confirmBooking(req, res, next) {
  try {
    const booking = await confirmService.confirmBooking({
      holdId: req.body.holdId,
      userId: req.user.id,
    });
    return res.status(200).json({ booking: serializeBooking(booking) });
  } catch (error) {
    next(error);
  }
}

export async function getBookingByHold(req, res, next) {
  try {
    const booking = await confirmService.getBookingByHold(req.params.holdId, {
      userId: req.user.id,
      role: req.user.role,
    });
    return res.status(200).json({ booking: serializeBooking(booking) });
  } catch (error) {
    next(error);
  }
}

export async function getAllBookings(req, res, next) {
  try {
    const result = await bookingService.getAllBookings(req.query);
    return res.status(200).json({ ...result, items: result.items.map(serializeBooking) });
  } catch (error) {
    next(error);
  }
}
