import { Router } from 'express';
import * as cinemaController from '../controllers/cinemaController.js';
import { verifyToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleGuard.js';
import { validate } from '../middleware/validate.js';
import { createCinemaSchema, updateCinemaSchema } from '../validators/cinemaValidators.js';

const router = Router();

// Public cinema listings (FR-23)
router.get('/', cinemaController.listCinemas);
router.get('/:id', cinemaController.getCinema);

// Admin-only cinema management (FR-23)
router.post('/', verifyToken, requireRole('admin'), validate(createCinemaSchema), cinemaController.createCinema);
router.patch('/:id', verifyToken, requireRole('admin'), validate(updateCinemaSchema), cinemaController.updateCinema);
router.delete('/:id', verifyToken, requireRole('admin'), cinemaController.deleteCinema);

export default router;
