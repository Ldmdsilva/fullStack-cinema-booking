import { Router } from 'express';
import * as filmController from '../controllers/filmController.js';
import { verifyToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleGuard.js';
import { validate } from '../middleware/validate.js';
import { createFilmSchema, updateFilmSchema } from '../validators/filmValidators.js';

const router = Router();

// Public film routes (FR-20, FR-21)
router.get('/', filmController.listFilms);
router.get('/:id', filmController.getFilm);

// Admin-only film routes
router.post('/', verifyToken, requireRole('admin'), validate(createFilmSchema), filmController.createFilm);
router.put('/:id', verifyToken, requireRole('admin'), validate(updateFilmSchema), filmController.updateFilm);
router.delete('/:id', verifyToken, requireRole('admin'), filmController.deleteFilm);

export default router;
