import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import User from '../models/User.js';
import Booking from '../models/Booking.js';
import Showtime from '../models/Showtime.js';
import { AppError } from '../middleware/errorHandler.js';
import { normaliseLk } from '../utils/phone.js';
import * as tokenService from './tokenService.js';
import * as tokenDenylistService from './tokenDenylistService.js';
import { notifyVerifyEmail, notifyPasswordReset } from './notification/notificationService.js';
import { refundPayment } from './paymentService.js';
import { broadcastShowtimeSeatsUpdated } from '../sockets/seatSocketGateway.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

/**
 * A fixed, precomputed bcrypt hash of a password nobody will ever type,
 * consulted on the "no such user" path of `login()` so that path costs the
 * same bcrypt-compare time as a genuine wrong-password attempt (FR-2, NFR-7).
 * Without this, an unknown email short-circuits before ever touching bcrypt
 * and is measurably faster than a known email with a wrong password — a
 * timing oracle an attacker can use to enumerate registered addresses.
 * Computed once at module load, never used for a real credential check.
 */
const DUMMY_HASH = bcrypt.hashSync('a-fixed-dummy-password-never-used-for-real-auth', 10);

/**
 * Generate signed JWT token
 * @param {object} user - User document
 * @returns {string} Signed JWT
 */
export function generateToken(user) {
  // JWT `iat` is truncated to whole seconds by the `jsonwebtoken` library.
  // If a JWT were minted with `iat = now` in the same wall-clock second as a
  // `tokenDenylistService.revokeAllForUser(userRef, revokedBefore = now, ...)`
  // call, the new token's truncated `iat` could be <= `revokedBefore`,
  // causing `isRevoked` to incorrectly treat a brand-new token as revoked.
  // Setting `iat` explicitly to just over a second ahead of "now" guarantees
  // it lands strictly after any `revokedBefore` captured up to this instant,
  // regardless of second-boundary truncation on either side. `jsonwebtoken`
  // only injects its own default `iat` when the payload doesn't already
  // carry one (see node_modules/jsonwebtoken/sign.js: `payload.iat ||
  // Math.floor(Date.now() / 1000)`), so an explicit truthy `iat` here is
  // used as-is and `expiresIn` still computes relative to it.
  const iat = Math.ceil((Date.now() + 1000) / 1000);

  return jwt.sign(
    {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      iat,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '1d',
    }
  );
}

/**
 * Register a new user account (FR-1). Registration never issues a JWT —
 * login is the only token issuer (D14) — and never reveals whether the
 * supplied email was already registered (FR-7/NFR-7): the response and the
 * amount of work done are the same either way, right down to hashing the
 * password before the existence check so a duplicate-email request isn't
 * measurably cheaper than a genuine signup.
 * @param {object} params
 * @param {string} params.name
 * @param {string} params.email
 * @param {string} params.password
 * @param {string} params.phone
 * @returns {Promise<{ message: string }>}
 */
export async function register({ name, email, password, phone }) {
  if (!name || !email || !password || !phone) {
    throw new AppError('Name, email, password, and phone are required', 400, 'VALIDATION_ERROR');
  }

  if (password.length < 6) {
    throw new AppError('Password must be at least 6 characters long', 400, 'VALIDATION_ERROR', {
      field: 'password',
    });
  }

  const normalizedPhone = normaliseLk(phone);
  if (!normalizedPhone) {
    throw new AppError('Phone must be a valid Sri Lankan mobile number', 400, 'VALIDATION_ERROR', {
      field: 'phone',
    });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const message = 'Registration successful — check your email to verify your account.';

  // Hash first, check for an existing account second — both branches below
  // do a bcrypt hash and a User lookup, so neither response nor its timing
  // gives away whether the email was already registered (FR-7).
  const passwordHash = await bcrypt.hash(password, 10);
  const existingUser = await User.findOne({ email: normalizedEmail });

  if (existingUser) {
    return { message };
  }

  const user = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    passwordHash,
    phone: normalizedPhone,
    role: 'customer',
    // emailVerified defaults to false on the schema — left unset here.
  });

  const { token: rawToken } = await tokenService.issueToken(
    user._id,
    'verify_email',
    env.VERIFY_TOKEN_TTL_HOURS * 60 * 60 * 1000
  );
  const verifyUrl = `${env.CLIENT_URL}/verify-email?token=${rawToken}`;
  notifyVerifyEmail({ user, verifyUrl }); // fire-and-forget, never throws

  return { message };
}

/**
 * Redeem an email-verification link (FR-1/FR-4). No JWT is issued here —
 * login remains the only token issuer (D14).
 * @param {object} params
 * @param {string} params.token - raw token from the emailed link
 * @returns {Promise<{ verified: true }>}
 */
export async function verifyEmail({ token }) {
  const authToken = await tokenService.consumeToken(token, 'verify_email');
  await User.findByIdAndUpdate(authToken.userRef, { emailVerified: true });
  return { verified: true };
}

/**
 * Resend a verification email to the currently-authenticated user (§C7.1:
 * `Auth: Any`). Always responds identically whether the account is already
 * verified or not, and only actually issues+sends a new token when it is
 * genuinely still unverified — outstanding tokens are invalidated first so
 * old links stop working once a fresh one is issued.
 * @param {object} params
 * @param {string} params.userId - id of the authenticated caller
 * @returns {Promise<{ message: string }>}
 */
export async function resendVerification({ userId }) {
  const message = 'If your account is not yet verified, a new verification email has been sent.';
  const user = await User.findById(userId);

  if (user && !user.emailVerified) {
    await tokenService.invalidateOutstandingTokens(user._id, 'verify_email');
    const { token: rawToken } = await tokenService.issueToken(
      user._id,
      'verify_email',
      env.VERIFY_TOKEN_TTL_HOURS * 60 * 60 * 1000
    );
    const verifyUrl = `${env.CLIENT_URL}/verify-email?token=${rawToken}`;
    notifyVerifyEmail({ user, verifyUrl });
  }

  return { message };
}

/**
 * Authenticate existing user and issue token (FR-2). The only place a JWT
 * is minted (D14). Does not check `emailVerified` — unverified users may
 * still log in and manage their profile, they're just blocked from booking
 * by `verifiedGuard` on those specific routes.
 * @param {object} params
 * @param {string} params.email
 * @param {string} params.password
 * @returns {Promise<{ user: object, token: string }>}
 */
export async function login({ email, password }) {
  if (!email || !password) {
    throw new AppError('Email and password are required', 400, 'VALIDATION_ERROR');
  }

  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');

  if (!user) {
    // Burn the same bcrypt-compare cost a real wrong-password attempt would
    // pay, so an unknown email isn't measurably faster than a known one
    // with a bad password (timing side-channel closed — see DUMMY_HASH).
    await bcrypt.compare(password, DUMMY_HASH);
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  const token = generateToken(user);

  return { user, token };
}

/**
 * Request a password reset link (FR-15/FR-16). Always resolves the same
 * way whether or not the email belongs to an account — never leaks
 * existence.
 * @param {object} params
 * @param {string} params.email
 * @returns {Promise<{ message: string }>}
 */
export async function forgotPassword({ email }) {
  const message = 'If an account exists for that address, a password reset link has been sent.';

  const normalizedEmail = typeof email === 'string' ? email.toLowerCase().trim() : '';
  const user = normalizedEmail ? await User.findOne({ email: normalizedEmail }) : null;

  if (user) {
    const { token: rawToken } = await tokenService.issueToken(
      user._id,
      'reset_password',
      env.RESET_TOKEN_TTL_MINUTES * 60 * 1000
    );
    const resetUrl = `${env.CLIENT_URL}/reset-password?token=${rawToken}`;
    notifyPasswordReset({ user, resetUrl }); // fire-and-forget, never throws
  }

  return { message };
}

/**
 * Redeem a password-reset link and set a new password (FR-15). Also logs
 * the user out everywhere: every outstanding reset token is invalidated and
 * every previously-issued JWT is revoked, so a session captured before the
 * reset stops working immediately rather than riding out its natural `exp`.
 * @param {object} params
 * @param {string} params.token - raw token from the emailed link
 * @param {string} params.newPassword
 * @returns {Promise<{ message: string }>}
 */
export async function resetPassword({ token, newPassword }) {
  const authToken = await tokenService.consumeToken(token, 'reset_password');

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await User.findByIdAndUpdate(authToken.userRef, { passwordHash });

  await tokenService.invalidateOutstandingTokens(authToken.userRef, 'reset_password');
  await tokenDenylistService.revokeAllForUser(
    authToken.userRef,
    new Date(),
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days — outlives any JWT's real TTL
  );

  return { message: 'Password has been reset. Please log in again.' };
}

/**
 * Get user profile by ID (FR-5)
 * @param {string} userId
 * @returns {Promise<object>}
 */
export async function getUserProfile(userId) {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }
  return user;
}

/**
 * Update user profile (FR-5)
 * @param {string} userId
 * @param {object} updates
 * @param {string} [updates.name]
 * @param {string} [updates.email]
 * @param {string} [updates.phone]
 * @returns {Promise<object>}
 */
export async function updateUserProfile(userId, { name, email, phone }) {
  const updates = {};
  if (name) updates.name = name.trim();
  if (email) {
    const normalizedEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail, _id: { $ne: userId } });
    if (existing) {
      throw new AppError('Email is already in use by another account', 409, 'DUPLICATE_EMAIL');
    }
    updates.email = normalizedEmail;
  }
  if (phone) {
    const normalizedPhone = normaliseLk(phone);
    if (!normalizedPhone) {
      throw new AppError('Phone must be a valid Sri Lankan mobile number', 400, 'VALIDATION_ERROR', {
        field: 'phone',
      });
    }
    updates.phone = normalizedPhone;
  }

  const user = await User.findByIdAndUpdate(userId, updates, {
    returnDocument: 'after',
    runValidators: true,
  });

  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  return user;
}

/**
 * Delete a user account (FR-6). Releases seats and refunds any confirmed
 * bookings, then anonymises the account in place rather than hard-deleting
 * it — a hard delete would leave existing bookings' `userRef` dangling.
 * @param {string} userId
 */
export async function deleteUserAccount(userId) {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  const activeBookings = await Booking.find({ userRef: userId, status: 'confirmed' });

  for (const booking of activeBookings) {
    if (booking.paymentIntentId) {
      try {
        await refundPayment(booking.paymentIntentId);
      } catch (error) {
        logger.error({ err: error, reference: booking.reference }, '[AuthService] Refund failed during account deletion');
      }
    }

    const seatIds = booking.seats.map((seat) => seat.id);
    await Showtime.updateOne(
      { _id: booking.showtimeRef },
      { $set: { 'seats.$[elem].status': 'available' } },
      { arrayFilters: [{ 'elem.id': { $in: seatIds } }] }
    );
    broadcastShowtimeSeatsUpdated(booking.showtimeRef.toString(), seatIds, 'available');

    booking.status = 'cancelled';
    await booking.save();
  }

  user.name = 'Deleted user';
  user.email = `deleted-${user._id}@encore.invalid`;
  user.phone = '94100000000';
  user.passwordHash = await bcrypt.hash(randomUUID(), 10);
  await user.save();
}
