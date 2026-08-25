import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import mongoose from 'mongoose';
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import Booking from '../../src/models/Booking.js';

/**
 * Booking model — finalized Showtime/Hold-only schema (ADR-014, §P6).
 * The legacy Event-flow fields (`eventRef`, the nested `payment` sub-object,
 * `holdExpiresAt`, and the `pending`/`expired` status values) are gone
 * entirely: `showtimeRef`, `holdRef`, `paymentIntentId`, and `paymentStatus`
 * are all required, since nothing produces a Booking any other way any more
 * (a Booking is only ever created by `confirmService.fulfilHold` after a
 * verified successful payment).
 */
describe('models/Booking.js (finalized Showtime/Hold schema)', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  function baseFields(overrides = {}) {
    return {
      reference: `ENC-${new mongoose.Types.ObjectId().toString().slice(-6)}`,
      userRef: new mongoose.Types.ObjectId(),
      showtimeRef: new mongoose.Types.ObjectId(),
      holdRef: new mongoose.Types.ObjectId(),
      paymentIntentId: `pi_${new mongoose.Types.ObjectId().toString()}`,
      paymentStatus: 'succeeded',
      seats: [{ id: 'A-1', section: 'Main', row: 'A', number: 1, price: 50 }],
      totalPrice: 50,
      ...overrides,
    };
  }

  describe('required-field validation', () => {
    it('validates fine when every required field is present', async () => {
      const booking = new Booking(baseFields());
      await expect(booking.validate()).resolves.toBeUndefined();
    });

    it('fails validation when showtimeRef is missing', async () => {
      const booking = new Booking(baseFields({ showtimeRef: undefined }));
      await expect(booking.validate()).rejects.toThrow(/Showtime reference is required/);
    });

    it('fails validation when holdRef is missing', async () => {
      const booking = new Booking(baseFields({ holdRef: undefined }));
      await expect(booking.validate()).rejects.toThrow(/Hold reference is required/);
    });

    it('fails validation when paymentIntentId is missing', async () => {
      const booking = new Booking(baseFields({ paymentIntentId: undefined }));
      await expect(booking.validate()).rejects.toThrow(/Payment intent id is required/);
    });

    it('fails validation when paymentStatus is missing', async () => {
      const booking = new Booking(baseFields({ paymentStatus: undefined }));
      await expect(booking.validate()).rejects.toThrow(/Payment status is required/);
    });

    it('no longer has an eventRef or a nested payment sub-object', async () => {
      const booking = new Booking(baseFields());
      expect(booking.eventRef).toBeUndefined();
      expect(booking.payment).toBeUndefined();
      expect(booking.holdExpiresAt).toBeUndefined();
    });
  });

  describe('holdRef uniqueness', () => {
    it('rejects a second booking sharing the same holdRef', async () => {
      const holdRef = new mongoose.Types.ObjectId();
      await Booking.create(baseFields({ holdRef }));
      await expect(Booking.create(baseFields({ holdRef }))).rejects.toMatchObject({ code: 11000 });
    });
  });

  describe('paymentIntentId uniqueness', () => {
    it('rejects a second booking sharing the same paymentIntentId', async () => {
      await Booking.create(baseFields({ paymentIntentId: 'pi_shared_1' }));
      await expect(Booking.create(baseFields({ paymentIntentId: 'pi_shared_1' }))).rejects.toMatchObject({
        code: 11000,
      });
    });
  });

  describe('status enum', () => {
    it('defaults to confirmed when omitted', async () => {
      const booking = await Booking.create(baseFields());
      expect(booking.status).toBe('confirmed');
    });

    it('accepts cancelled', async () => {
      const booking = await Booking.create(baseFields({ status: 'cancelled' }));
      expect(booking.status).toBe('cancelled');
    });

    it('rejects a legacy pending/expired status — those values no longer exist on this model', async () => {
      const pending = new Booking(baseFields({ status: 'pending' }));
      await expect(pending.validate()).rejects.toThrow();

      const expired = new Booking(baseFields({ status: 'expired' }));
      await expect(expired.validate()).rejects.toThrow();
    });
  });
});
