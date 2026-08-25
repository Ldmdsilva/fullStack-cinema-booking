import { Router } from 'express';
import * as userController from '../controllers/userController.js';
import { verifyToken } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { updateProfileSchema } from '../validators/authValidators.js';

const router = Router();

// Protected user routes (FR-5, FR-6)
router.get('/me', verifyToken, userController.getMe);
router.patch('/me', verifyToken, validate(updateProfileSchema), userController.updateMe);
router.delete('/me', verifyToken, userController.deleteMe);

export default router;
