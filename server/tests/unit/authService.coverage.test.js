import { describe, it, expect, beforeAll, beforeEach, afterAll, jest } from '@jest/globals';
import mongoose from 'mongoose';
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import { createStripeMock, mockStripeModule } from '../helpers/mocks.js';
import Film from '../../src/models/Film.js';
import Cinema from '../../src/models/Cinema.js';
import Showtime from '../../src/models/Showtime.js';
import Booking from '../../src/models/Booking.js';
import User from '../../src/models/User.js';

// deleteUserAccount refunds confirmed bookings via paymentService -> stripe,
// so stripe must be mocked before the dynamic import of authService below.
const stripeMock = createStripeMock();
mockStripeModule(stripeMock);

let authService;

// register() no longer returns { user, token } (D14: 202 { message } only,
// no JWT until login) — these tests exercise getUserProfile/updateUserProfile
// /deleteUserAccount, not register itself, so this helper registers via the
// real service (still exercising hashing/validation) and then fetches the
// resulting User document the normal DB way.
async function registerUser(authServiceRef, params) {
  await authServiceRef.register(params);
  return User.findOne({ email: params.email.toLowerCase().trim() });
}

describe('services/authService.js — additional coverage (profile, account deletion)', () => {
  beforeAll(async () => {
    await connectTestDB();
    authService = await import('../../src/services/authService.js');
  });

  afterAll(async () => {
    await closeTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
    jest.clearAllMocks();
  });

  it('register rejects a password shorter than 6 characters', async () => {
    await expect(
      authService.register({ name: 'Short Pw', email: 'shortpw@test.com', password: '123', phone: '0771234567' })
    ).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
  });

  it('login rejects missing email/password with 400 VALIDATION_ERROR', async () => {
    await expect(authService.login({ email: '', password: '' })).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('login rejects an unknown email with the generic 401 INVALID_CREDENTIALS (no enumeration)', async () => {
    await expect(authService.login({ email: 'nobody@test.com', password: 'whatever1' })).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
    });
  });

  describe('getUserProfile', () => {
    it('returns the user profile for a valid id', async () => {
      const user = await registerUser(authService, {
        name: 'Profile User',
        email: 'profile@test.com',
        password: 'password123',
        phone: '0771234567',
      });

      const profile = await authService.getUserProfile(user.id);
      expect(profile.email).toBe('profile@test.com');
    });

    it('rejects a non-existent user id with 404 USER_NOT_FOUND', async () => {
      await expect(authService.getUserProfile('64b64b64b64b64b64b64b64b')).rejects.toMatchObject({
        statusCode: 404,
        code: 'USER_NOT_FOUND',
      });
    });
  });

  describe('updateUserProfile', () => {
    it('updates name, email, and phone together', async () => {
      const user = await registerUser(authService, {
        name: 'Update Me',
        email: 'updateme@test.com',
        password: 'password123',
        phone: '0771234567',
      });

      const updated = await authService.updateUserProfile(user.id, {
        name: 'Updated Name',
        email: 'updated@test.com',
        phone: '0777654321',
      });

      expect(updated.name).toBe('Updated Name');
      expect(updated.email).toBe('updated@test.com');
      expect(updated.phone).toBe('94777654321');
    });

    it('rejects an email already in use by another account with 409 DUPLICATE_EMAIL', async () => {
      await authService.register({ name: 'User A', email: 'usera@test.com', password: 'password123', phone: '0771234567' });
      const userB = await registerUser(authService, {
        name: 'User B',
        email: 'userb@test.com',
        password: 'password123',
        phone: '0777654321',
      });

      await expect(authService.updateUserProfile(userB.id, { email: 'usera@test.com' })).rejects.toMatchObject({
        statusCode: 409,
        code: 'DUPLICATE_EMAIL',
      });
    });

    it('rejects an invalid phone with 400 VALIDATION_ERROR', async () => {
      const user = await registerUser(authService, {
        name: 'Phone Guard User',
        email: 'phoneguard@test.com',
        password: 'password123',
        phone: '0771234567',
      });

      await expect(authService.updateUserProfile(user.id, { phone: '123' })).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('rejects updating a non-existent user with 404 USER_NOT_FOUND', async () => {
      await expect(authService.updateUserProfile('64b64b64b64b64b64b64b64b', { name: 'Ghost' })).rejects.toMatchObject({
        statusCode: 404,
        code: 'USER_NOT_FOUND',
      });
    });
  });

  describe('deleteUserAccount', () => {
    it('rejects a non-existent user with 404 USER_NOT_FOUND', async () => {
      await expect(authService.deleteUserAccount('64b64b64b64b64b64b64b64b')).rejects.toMatchObject({
        statusCode: 404,
        code: 'USER_NOT_FOUND',
      });
    });

    it('anonymises the account, refunds confirmed bookings, releases seats, and cancels pending bookings', async () => {
      const user = await registerUser(authService, {
        name: 'To Delete',
        email: 'todelete@test.com',
        password: 'password123',
        phone: '0771234567',
      });

      const film = await Film.create({
        title: 'Delete Account Film',
        synopsis: 'A synopsis.',
        certificate: 'PG',
        runtimeMinutes: 100,
        genre: ['Drama'],
        releaseDate: new Date(Date.now() - 86400000),
      });
      const cinema = await Cinema.create({
        name: 'Delete Account Cinema',
        address: '1 Delete Ave',
        city: 'Colombo',
        screens: [
          {
            screenId: '1',
            name: 'Screen 1',
            seatLayout: [
              { id: 'A-1', section: 'STANDARD', row: 'A', number: 1 },
              { id: 'A-2', section: 'STANDARD', row: 'A', number: 2 },
            ],
          },
        ],
      });
      const showtime = await Showtime.create({
        filmRef: film._id,
        cinemaRef: cinema._id,
        screenId: '1',
        screenName: 'Screen 1',
        startsAt: new Date(Date.now() + 86400000),
        basePrice: 50,
        seats: [
          { id: 'A-1', section: 'STANDARD', row: 'A', number: 1, tier: 'STANDARD', status: 'booked', price: 50 },
          { id: 'A-2', section: 'STANDARD', row: 'A', number: 2, tier: 'STANDARD', status: 'held', price: 50 },
        ],
        status: 'scheduled',
      });

      const confirmedBooking = await Booking.create({
        reference: 'ENC-DELETE-CONFIRMED',
        userRef: user.id,
        showtimeRef: showtime._id,
        holdRef: new mongoose.Types.ObjectId(),
        paymentIntentId: 'pi_delete_account',
        paymentStatus: 'succeeded',
        seats: [{ id: 'A-1', section: 'STANDARD', row: 'A', number: 1, price: 50 }],
        totalPrice: 50,
        status: 'confirmed',
      });
      const secondConfirmedBooking = await Booking.create({
        reference: 'ENC-DELETE-CONFIRMED-2',
        userRef: user.id,
        showtimeRef: showtime._id,
        holdRef: new mongoose.Types.ObjectId(),
        paymentIntentId: 'pi_delete_account_2',
        paymentStatus: 'succeeded',
        seats: [{ id: 'A-2', section: 'STANDARD', row: 'A', number: 2, price: 50 }],
        totalPrice: 50,
        status: 'confirmed',
      });

      await authService.deleteUserAccount(user.id);

      const deletedUser = await User.findById(user.id);
      expect(deletedUser.name).toBe('Deleted user');
      expect(deletedUser.email).toBe(`deleted-${user.id}@encore.invalid`);

      const refundedBooking = await Booking.findById(confirmedBooking._id);
      expect(refundedBooking.status).toBe('cancelled');
      expect(stripeMock.refunds.create).toHaveBeenCalledWith({ payment_intent: 'pi_delete_account' });

      const secondCancelledBooking = await Booking.findById(secondConfirmedBooking._id);
      expect(secondCancelledBooking.status).toBe('cancelled');
      expect(stripeMock.refunds.create).toHaveBeenCalledWith({ payment_intent: 'pi_delete_account_2' });

      const updatedShowtime = await Showtime.findById(showtime._id);
      expect(updatedShowtime.seats.find((s) => s.id === 'A-1').status).toBe('available');
      expect(updatedShowtime.seats.find((s) => s.id === 'A-2').status).toBe('available');
    });
  });
});
