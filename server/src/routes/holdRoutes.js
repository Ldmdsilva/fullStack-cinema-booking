import { Router } from 'express';
import * as holdController from '../controllers/holdController.js';
import { verifyToken } from '../middleware/auth.js';
import { requireVerified } from '../middleware/verifiedGuard.js';
import { validate } from '../middleware/validate.js';
import { createHoldSchema } from '../validators/holdValidators.js';

const router = Router();

// Showtime/Hold domain (§C7.1, D6, D12) — additive, parallel to the legacy
// Event/Booking checkout flow mounted at /api/bookings.
router.post('/', verifyToken, requireVerified, validate(createHoldSchema), holdController.createHold);
router.get('/:id', verifyToken, holdController.getHold);
router.post('/:id/payment-intent', verifyToken, requireVerified, holdController.createPaymentIntentForHold);
router.delete('/:id', verifyToken, requireVerified, holdController.releaseHold);

export default router;
