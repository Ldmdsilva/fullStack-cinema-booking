import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import User from '../../src/models/User.js';
import Showtime from '../../src/models/Showtime.js';
import Hold from '../../src/models/Hold.js';

let app;

const CONCURRENT_REQUESTS = 50;

async function createSingleSeatShowtime() {
  return Showtime.create({
    filmRef: new mongoose.Types.ObjectId(),
    cinemaRef: new mongoose.Types.ObjectId(),
    screenId: '1',
    screenName: 'Screen 1',
    startsAt: new Date(Date.now() + 86400000),
    basePrice: 1000,
    status: 'scheduled',
    seats: [
      {
        id: 'A-1',
        section: 'STANDARD',
        row: 'A',
        number: 1,
        tier: 'STANDARD',
        price: 1000,
        status: 'available',
      },
    ],
  });
}

async function createVerifiedCustomerAndLogin(index) {
  const password = 'ConcurrencyPassword123!';
  const passwordHash = await bcrypt.hash(password, 10);
  const email = `hold-concurrency-${index}@test.com`;
  await User.create({
    name: `Concurrency User ${index}`,
    email,
    passwordHash,
    phone: `9477${String(2000000 + index).padStart(7, '0')}`,
    role: 'customer',
    emailVerified: true,
  });

  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token;
}

describe('D4.3(a) — POST /api/holds concurrency guard (O7: zero double-bookings)', () => {
  beforeAll(async () => {
    await connectTestDB();
    app = (await import('../../src/app.js')).default;
  });

  afterAll(async () => {
    await closeTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  it(
    `fires ${CONCURRENT_REQUESTS} simultaneous POST /api/holds at one seat: exactly one 201, exactly ${
      CONCURRENT_REQUESTS - 1
    } 409 SEAT_UNAVAILABLE, and exactly one active Hold afterward`,
    async () => {
      const showtime = await createSingleSeatShowtime();

      // Seed distinct verified customer users, each with their own JWT, so
      // the same-user rate limiter / any per-user guard can't mask the
      // seat-level concurrency result.
      const tokens = [];
      for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
        tokens.push(await createVerifiedCustomerAndLogin(i));
      }

      // Fire all 50 requests genuinely concurrently.
      const responses = await Promise.all(
        tokens.map((token) =>
          request(app)
            .post('/api/holds')
            .set('Authorization', `Bearer ${token}`)
            .send({ showtimeId: showtime._id.toString(), seatIds: ['A-1'] })
        )
      );

      const succeeded = responses.filter((res) => res.status === 201);
      const conflicted = responses.filter((res) => res.status === 409);
      const other = responses.filter((res) => res.status !== 201 && res.status !== 409);

      expect(other).toHaveLength(0);
      expect(succeeded).toHaveLength(1);
      expect(conflicted).toHaveLength(CONCURRENT_REQUESTS - 1);
      conflicted.forEach((res) => {
        expect(res.body.error.code).toBe('SEAT_UNAVAILABLE');
      });
      expect(succeeded[0].body.holdId).toBeDefined();

      // Exactly one Hold document exists, and it is active.
      const totalHolds = await Hold.countDocuments({});
      expect(totalHolds).toBe(1);
      const activeHolds = await Hold.countDocuments({ status: 'active' });
      expect(activeHolds).toBe(1);

      const activeHold = await Hold.findOne({ status: 'active' });
      expect(activeHold._id.toString()).toBe(succeeded[0].body.holdId);

      // The seat itself reflects the single winner.
      const updatedShowtime = await Showtime.findById(showtime._id);
      expect(updatedShowtime.seats[0].status).toBe('held');
      expect(updatedShowtime.seats[0].holdRef.toString()).toBe(succeeded[0].body.holdId);
    },
    60000
  );
});
