import Stripe from 'stripe';
import { env } from './env.js';

/**
 * Stripe client (ADR-010). Falls back to an obviously-fake key so the
 * module can load without a configured secret; any real API call made
 * with the placeholder fails loudly with a Stripe authentication error
 * rather than crashing the whole process at startup.
 */
export const stripe = new Stripe(env.STRIPE_SECRET_KEY || 'sk_test_missing_stripe_secret_key');
