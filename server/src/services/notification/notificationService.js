import { sendEmail } from './emailService.js';
import { sendSms } from './smsService.js';
import { logger } from '../../config/logger.js';
import { verifyEmailTemplate } from '../../templates/email/verifyEmail.js';
import { passwordResetTemplate } from '../../templates/email/passwordReset.js';
import { bookingConfirmedTemplate } from '../../templates/email/bookingConfirmed.js';
import { bookingCancelledTemplate } from '../../templates/email/bookingCancelled.js';
import { bookingConfirmedSms, bookingCancelledSms } from '../../templates/sms.js';

/**
 * Notifications are called *after* the triggering database write commits,
 * and are always fire-and-forget from the caller's perspective — a dead
 * SMTP host or notify.lk outage must never turn a paid booking into a 500
 * (ADR-012). Every function below is safe to call without `await`.
 */

async function safely(label, work) {
  try {
    await work();
  } catch (error) {
    logger.error({ err: error }, `[Notification] ${label} failed`);
  }
}

export function notifyVerifyEmail({ user, verifyUrl }) {
  safely('verify-email email', async () => {
    const { subject, html, text } = verifyEmailTemplate({ name: user.name, verifyUrl });
    await sendEmail({ to: user.email, subject, html, text });
  });
}

export function notifyPasswordReset({ user, resetUrl }) {
  safely('password-reset email', async () => {
    const { subject, html, text } = passwordResetTemplate({ name: user.name, resetUrl });
    await sendEmail({ to: user.email, subject, html, text });
  });
}

export function notifyBookingConfirmed({ user, booking, event, venue }) {
  safely('booking-confirmed email', async () => {
    const { subject, html, text } = bookingConfirmedTemplate({ booking, event, venue });
    await sendEmail({ to: user.email, subject, html, text });
  });
  safely('booking-confirmed sms', async () => {
    await sendSms(user.phone, bookingConfirmedSms({ booking, event, venue }));
  });
}

export function notifyBookingCancelled({ user, booking, refunded }) {
  safely('booking-cancelled email', async () => {
    const { subject, html, text } = bookingCancelledTemplate({ booking, refunded });
    await sendEmail({ to: user.email, subject, html, text });
  });
  safely('booking-cancelled sms', async () => {
    await sendSms(user.phone, bookingCancelledSms({ booking }));
  });
}
