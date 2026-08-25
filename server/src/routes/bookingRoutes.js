import { Router } from 'express';
import * as bookingController from '../controllers/bookingController.js';
import { verifyToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleGuard.js';
import { validate } from '../middleware/validate.js';
import { confirmBookingSchema } from '../validators/bookingValidators.js';

const router = Router();

// Customer bookings (FR-17, FR-18, FR-19)
router.get('/me', verifyToken, bookingController.getMyBookings);

// Showtime/Hold domain (ADR-014, additive, §C7.1). These MUST be registered
// before `/:id` below — Express matches routes in registration order, and
// `/:id` would otherwise swallow `/confirm` (as id='confirm') and
// `/by-hold/:holdId` (as id='by-hold').
router.post('/confirm', verifyToken, validate(confirmBookingSchema), bookingController.confirmBooking);
router.get('/by-hold/:holdId', verifyToken, bookingController.getBookingByHold);

router.get('/:id', verifyToken, bookingController.getBookingById);
router.patch('/:id/cancel', verifyToken, bookingController.cancelBooking);

// Admin-only booking management (FR-24, FR-25)
router.get('/', verifyToken, requireRole('admin'), bookingController.getAllBookings);

export default router;
