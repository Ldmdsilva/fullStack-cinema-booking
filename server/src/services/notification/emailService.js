import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

let transporterPromise = null;

/**
 * Dev/test convenience only: the most recent email sent to each recipient,
 * kept in memory for the process lifetime so local dev and e2e tests can
 * read a verification/reset link without a real mailbox (there's no live
 * SMTP in dev — it's either Ethereal or, under Jest, `jsonTransport`).
 * Never persisted; not a substitute for a real mail log.
 */
const lastMailByRecipient = new Map(); // key: lowercased email, value: { to, subject, html, text, sentAt }

/**
 * Lazily build (and memoise) the nodemailer transport: `jsonTransport` in
 * tests (nothing leaves the process), the configured SMTP host in
 * development/production, or an auto-created Ethereal account as a
 * zero-setup development fallback.
 */
function getTransporter() {
  if (transporterPromise) return transporterPromise;

  transporterPromise = (async () => {
    if (env.NODE_ENV === 'test') {
      return nodemailer.createTransport({ jsonTransport: true });
    }

    if (env.SMTP_HOST) {
      return nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
      });
    }

    const testAccount = await nodemailer.createTestAccount();
    logger.info('[Email] No SMTP_HOST configured — using an Ethereal test account for development');
    return nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
  })();

  return transporterPromise;
}

/**
 * Send an email. Never throws — a dead SMTP host must not turn a paid
 * booking into a 500 (notifications are best-effort, ADR-012).
 * @param {{ to: string, subject: string, html: string, text: string }} params
 * @returns {Promise<object|undefined>}
 */
export async function sendEmail({ to, subject, html, text }) {
  if (!env.EMAIL_ENABLED) {
    logger.info({ to, subject }, '[Email] Disabled — skipping send');
    return undefined;
  }

  try {
    const transporter = await getTransporter();
    const info = await transporter.sendMail({ from: env.MAIL_FROM, to, subject, html, text });

    lastMailByRecipient.set(to.toLowerCase().trim(), { to, subject, html, text, sentAt: new Date() });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      logger.info({ previewUrl }, '[Email] Preview URL');
    }

    return info;
  } catch (error) {
    logger.error({ err: error, to, subject }, '[Email] Send failed');
    return undefined;
  }
}

/**
 * Dev/test only: retrieve the last email sent to a given address, so local
 * dev and e2e tests can read a verification/reset link without a real
 * mailbox. In-memory only — never call this in production code paths.
 * @param {string} to
 * @returns {{ to: string, subject: string, html: string, text: string, sentAt: Date }|null}
 */
export function getLastMail(to) {
  return lastMailByRecipient.get(to.toLowerCase().trim()) ?? null;
}
