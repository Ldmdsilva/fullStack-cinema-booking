import { getLastMail } from '../services/notification/emailService.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Dev-only endpoint: return the last email sent to a given address, so local
 * dev and e2e tests can read a verification/reset link without a real
 * mailbox (D13). Mounted only when NODE_ENV !== 'production' (see app.js).
 */
export async function getLastMailForAddress(req, res, next) {
  try {
    const { email } = req.query;
    if (!email) {
      return next(new AppError('email query parameter is required', 400, 'VALIDATION_ERROR'));
    }

    const mail = getLastMail(email);
    if (!mail) {
      return next(new AppError('No email found for that address', 404, 'MAIL_NOT_FOUND'));
    }

    return res.status(200).json(mail);
  } catch (error) {
    next(error);
  }
}
