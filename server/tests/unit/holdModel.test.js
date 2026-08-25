import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import mongoose from 'mongoose';
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import Hold from '../../src/models/Hold.js';

function buildHoldData(overrides = {}) {
  return {
    userRef: new mongoose.Types.ObjectId(),
    showtimeRef: new mongoose.Types.ObjectId(),
    seatIds: ['A-1'],
    seatSnapshot: [{ id: 'A-1', section: 'STANDARD', price: 1000 }],
    totalPrice: 1000,
    amountMinor: 100000,
    currency: 'lkr',
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    ...overrides,
  };
}

describe('models/Hold.js (§C6.2, D6)', () => {
  beforeAll(async () => {
    await connectTestDB();
    // Ensure the unique/sparse index on paymentIntentId is actually built
    // before the duplicate-key tests below run — index creation is async
    // and otherwise races the first inserts against mongodb-memory-server.
    await Hold.init();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  it('creates a valid hold with default status "active"', async () => {
    const hold = await Hold.create(buildHoldData());

    expect(hold.status).toBe('active');
    expect(hold.seatIds).toEqual(['A-1']);
    expect(hold.seatSnapshot[0]).toMatchObject({ id: 'A-1', section: 'STANDARD', price: 1000 });
    expect(hold.paymentIntentId).toBeUndefined();
    expect(hold.createdAt).toBeInstanceOf(Date);
  });

  it("strips __v but keeps _id on toJSON, like Booking's transform", async () => {
    const hold = await Hold.create(buildHoldData());
    const json = hold.toJSON();

    expect(json.__v).toBeUndefined();
    expect(json._id).toBeDefined();
  });

  it('rejects an empty seatIds array', async () => {
    await expect(Hold.create(buildHoldData({ seatIds: [] }))).rejects.toThrow(
      /A hold must include at least one seat/
    );
  });

  it('rejects a duplicate paymentIntentId across two holds (unique index)', async () => {
    await Hold.create(buildHoldData({ paymentIntentId: 'pi_shared_123' }));

    await expect(
      Hold.create(
        buildHoldData({
          seatIds: ['B-1'],
          seatSnapshot: [{ id: 'B-1', section: 'PREMIUM', price: 1350 }],
          paymentIntentId: 'pi_shared_123',
        })
      )
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('allows two holds with no paymentIntentId at all to coexist (sparse index)', async () => {
    await Hold.create(buildHoldData({ seatIds: ['A-1'] }));
    await expect(
      Hold.create(
        buildHoldData({
          seatIds: ['A-2'],
          seatSnapshot: [{ id: 'A-2', section: 'STANDARD', price: 1000 }],
        })
      )
    ).resolves.toBeDefined();

    const count = await Hold.countDocuments({});
    expect(count).toBe(2);
  });
});
