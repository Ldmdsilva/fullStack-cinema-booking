import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

const NOTIFYLK_ENDPOINT = 'https://app.notify.lk/api/v1/send';
const SMS_MAX_LENGTH = 621;

function truncate(message) {
  if (message.length <= SMS_MAX_LENGTH) return message;
  return `${message.slice(0, SMS_MAX_LENGTH - 1)}…`;
}

/**
 * Send an SMS via notify.lk. Never throws — logs and moves on, never able
 * to fail the request that triggered it (ADR-012).
 * @param {string} to - normalised `94XXXXXXXXX` number
 * @param {string} message
 * @returns {Promise<object|undefined>}
 */
export async function sendSms(to, message) {
  if (!env.SMS_ENABLED) {
    logger.info({ to }, '[SMS] Disabled — skipping send');
    return undefined;
  }

  const body = new URLSearchParams({
    user_id: env.NOTIFYLK_USER_ID || '',
    api_key: env.NOTIFYLK_API_KEY || '',
    sender_id: env.NOTIFYLK_SENDER_ID,
    to,
    message: truncate(message),
  });

  try {
    const response = await fetch(NOTIFYLK_ENDPOINT, { method: 'POST', body });
    const data = await response.json().catch(() => null);

    // Success is exactly { status: 'success', data: 'Sent' } — any other body
    // (or a non-2xx) is a failure, logged and never thrown.
    if (!response.ok || data?.status !== 'success' || data?.data !== 'Sent') {
      logger.warn({ to, httpStatus: response.status, data }, '[SMS] notify.lk send failed');
    }

    return data;
  } catch (error) {
    logger.error({ err: error, to }, '[SMS] Send failed');
    return undefined;
  }
}
