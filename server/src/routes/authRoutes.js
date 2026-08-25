import { Router } from 'express';
import * as authController from '../controllers/authController.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { validate } from '../middleware/validate.js';
import { verifyToken } from '../middleware/auth.js';
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../validators/authValidators.js';

const router = Router();

// Public auth routes with rate limiting (§C7.1, NFR-5)
router.post('/register', authLimiter, validate(registerSchema), authController.register);
router.post('/verify-email', authLimiter, validate(verifyEmailSchema), authController.verifyEmail);
// Auth: Any (§C7.1) — resend acts on the authenticated caller's own account,
// no email in the body, so an enumeration-resistant generic response is
// meaningless here (the caller already knows their own identity).
router.post('/resend-verification', authLimiter, verifyToken, authController.resendVerification);
router.post('/login', authLimiter, validate(loginSchema), authController.login);
router.post('/forgot-password', authLimiter, validate(forgotPasswordSchema), authController.forgotPassword);
router.post('/reset-password', authLimiter, validate(resetPasswordSchema), authController.resetPassword);

export default router;
