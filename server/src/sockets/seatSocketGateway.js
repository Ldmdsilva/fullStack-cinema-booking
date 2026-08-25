import { getIO } from '../config/socket.js';

/**
 * Register socket event listeners and room management (§C7.2, ADR-003)
 * @param {import('socket.io').Server} io
 */
export function registerSeatSocketGateway(io) {
  io.on('connection', (socket) => {
    // Authenticated sockets auto-join their own booking-update room (§C7.2)
    if (socket.user?.id) {
      socket.join(`user:${socket.user.id}`);
    }

    // Client joins a showtime's seat room (§C7.2)
    socket.on('join:showtime', ({ showtimeId }) => {
      if (!showtimeId) {
        return socket.emit('error', {
          code: 'INVALID_SUBSCRIPTION',
          message: 'showtimeId is required to join a showtime room',
        });
      }

      const roomName = `showtime:${showtimeId}`;
      socket.join(roomName);
    });

    // Client leaves a showtime's seat room
    socket.on('leave:showtime', ({ showtimeId }) => {
      if (showtimeId) {
        socket.leave(`showtime:${showtimeId}`);
      }
    });

    socket.on('disconnect', () => {
      // Automatic cleanup handled by socket.io
    });
  });
}

/**
 * Notify a single user's connected sockets that one of their bookings
 * changed status, e.g. `pending` → `confirmed` after a webhook lands (§C7.2)
 * @param {string} userId
 * @param {{ id: string, status: string, paymentStatus?: string }} booking
 */
export function broadcastBookingUpdated(userId, booking) {
  try {
    const io = getIO();
    io.to(`user:${userId}`).emit('booking:updated', {
      bookingId: booking.id,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(`[Socket] Could not broadcast booking update: ${err.message}`);
    }
  }
}

/**
 * Broadcast seat updates to all clients in the showtime room (§C7.2)
 * Emitted only AFTER database write commits.
 * @param {string} showtimeId
 * @param {Array<string>} seatIds
 * @param {'available'|'held'|'booked'} status
 */
export function broadcastShowtimeSeatsUpdated(showtimeId, seatIds, status) {
  try {
    const io = getIO();
    io.to(`showtime:${showtimeId}`).emit('seats:updated', {
      showtimeId,
      seatIds,
      status,
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(`[Socket] Could not broadcast showtime seat update: ${err.message}`);
    }
  }
}

/**
 * Broadcast showtime cancellation to all clients in the showtime room (§C7.2)
 * @param {string} showtimeId
 */
export function broadcastShowtimeCancelled(showtimeId) {
  try {
    const io = getIO();
    io.to(`showtime:${showtimeId}`).emit('showtime:cancelled', {
      showtimeId,
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(`[Socket] Could not broadcast showtime cancellation: ${err.message}`);
    }
  }
}

/**
 * Notify a single user's connected sockets that a booking has been confirmed,
 * resolving a client's reconciling `?hold=` confirmation page when its
 * original confirm call never arrived (ADR-014, §C7.2).
 * @param {string} userId
 * @param {{ holdId: string, bookingId: string, reference: string }} details
 */
export function broadcastBookingConfirmed(userId, { holdId, bookingId, reference }) {
  try {
    const io = getIO();
    io.to(`user:${userId}`).emit('booking:confirmed', {
      holdId,
      bookingId,
      reference,
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(`[Socket] Could not broadcast booking confirmation: ${err.message}`);
    }
  }
}
