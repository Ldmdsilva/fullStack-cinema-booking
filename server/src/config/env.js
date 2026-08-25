import dotenv from 'dotenv';

dotenv.config();

/**
 * Frozen environment config, resolved once at import time — after dotenv has
 * loaded `.env`. Import this (or any module that imports it) before reading
 * any of these values, so `.env` is guaranteed to be loaded first.
 */
export const env = Object.freeze({
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  MONGODB_URI: process.env.MONGODB_URI,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '1d',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
  LOG_LEVEL: process.env.LOG_LEVEL,
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
  HOLD_TTL_MINUTES: Number(process.env.HOLD_TTL_MINUTES) || 10,
  VERIFY_TOKEN_TTL_HOURS: Number(process.env.VERIFY_TOKEN_TTL_HOURS) || 24,
  RESET_TOKEN_TTL_MINUTES: Number(process.env.RESET_TOKEN_TTL_MINUTES) || 30,
  RECONCILE_INTERVAL_MINUTES: Number(process.env.RECONCILE_INTERVAL_MINUTES) || 2,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY,
  STRIPE_CURRENCY: process.env.STRIPE_CURRENCY || 'lkr',
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: Number(process.env.SMTP_PORT) || 587,
  SMTP_SECURE: process.env.SMTP_SECURE === 'true',
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  MAIL_FROM: process.env.MAIL_FROM || 'Encore <no-reply@encore.live>',
  EMAIL_ENABLED: process.env.EMAIL_ENABLED !== 'false',
  NOTIFYLK_USER_ID: process.env.NOTIFYLK_USER_ID,
  NOTIFYLK_API_KEY: process.env.NOTIFYLK_API_KEY,
  NOTIFYLK_SENDER_ID: process.env.NOTIFYLK_SENDER_ID || 'NotifyDEMO',
  SMS_ENABLED: process.env.SMS_ENABLED !== 'false',
});
