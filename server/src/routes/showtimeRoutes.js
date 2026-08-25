import { Router } from 'express';
import * as showtimeController from '../controllers/showtimeController.js';
import { verifyToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleGuard.js';
import { validate } from '../middleware/validate.js';
import { createShowtimeSchema } from '../validators/showtimeValidators.js';

const router = Router();

// Public showtime browsing (FR-19–21, FR-26)
router.get('/', showtimeController.listShowtimes);
router.get('/:id', showtimeController.getShowtime);

// Admin-only showtime management (FR-24)
router.post(
  '/',
  verifyToken,
  requireRole('admin'),
  validate(createShowtimeSchema),
  showtimeController.createShowtime
);
router.patch('/:id/cancel', verifyToken, requireRole('admin'), showtimeController.cancelShowtime);

export default router;
