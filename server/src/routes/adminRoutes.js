import { Router } from 'express';
import * as adminController from '../controllers/adminController.js';
import { verifyToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleGuard.js';

const router = Router();

// Admin-only dashboard endpoints (FR-25)
router.get('/stats', verifyToken, requireRole('admin'), adminController.getStats);
router.get('/showtimes', verifyToken, requireRole('admin'), adminController.listShowtimes);

export default router;
