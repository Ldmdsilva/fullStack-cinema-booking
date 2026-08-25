import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import * as adminService from '../../src/services/adminService.js';
import Film from '../../src/models/Film.js';
import Cinema from '../../src/models/Cinema.js';
import Showtime from '../../src/models/Showtime.js';
import Booking from '../../src/models/Booking.js';
import User from '../../src/models/User.js';
import mongoose from 'mongoose';

describe('services/adminService.js — dashboard stats and admin showtime listing (FR-25)', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  async function seedScenario() {
    const film = await Film.create({
      title: 'Stats Film',
      synopsis: 'A synopsis.',
      certificate: 'PG',
      runtimeMinutes: 100,
      genre: ['Drama'],
      releaseDate: new Date(Date.now() - 86400000),
    });
    const cinema = await Cinema.create({
      name: 'Admin Stats Cineplex',
      address: '1 Stats Ave',
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
        { id: 'A-2', section: 'STANDARD', row: 'A', number: 2, tier: 'STANDARD', status: 'available', price: 50 },
      ],
      status: 'scheduled',
    });
    const cancelledShowtime = await Showtime.create({
      filmRef: film._id,
      cinemaRef: cinema._id,
      screenId: '1',
      screenName: 'Screen 1',
      startsAt: new Date(Date.now() + 86400000 * 2),
      basePrice: 30,
      seats: [{ id: 'A-1', section: 'STANDARD', row: 'A', number: 1, tier: 'STANDARD', status: 'available', price: 30 }],
      status: 'cancelled',
    });
    const user = await User.create({
      name: 'Stats User',
      email: 'statsuser@test.com',
      passwordHash: 'hash',
      phone: '94771234567',
      role: 'customer',
    });
    await Booking.create({
      reference: 'ENC-STATS-CONFIRMED',
      userRef: user._id,
      showtimeRef: showtime._id,
      holdRef: new mongoose.Types.ObjectId(),
      paymentIntentId: 'pi_stats_confirmed',
      paymentStatus: 'succeeded',
      seats: [{ id: 'A-1', section: 'STANDARD', row: 'A', number: 1, price: 50 }],
      totalPrice: 50,
      status: 'confirmed',
    });
    await Booking.create({
      reference: 'ENC-STATS-CANCELLED',
      userRef: user._id,
      showtimeRef: showtime._id,
      holdRef: new mongoose.Types.ObjectId(),
      paymentIntentId: 'pi_stats_cancelled',
      paymentStatus: 'succeeded',
      seats: [{ id: 'A-2', section: 'STANDARD', row: 'A', number: 2, price: 50 }],
      totalPrice: 50,
      status: 'cancelled',
    });

    return { film, cinema, showtime, cancelledShowtime, user };
  }

  describe('getStats', () => {
    it('returns zeroed stats when nothing exists yet', async () => {
      const stats = await adminService.getStats();
      expect(stats).toEqual({
        totalShowtimes: 0,
        upcomingShowtimes: 0,
        totalBookings: 0,
        confirmedBookings: 0,
        cancelledBookings: 0,
        totalRevenue: 0,
        totalSeats: 0,
        bookedSeats: 0,
        availableSeats: 0,
        occupancyRate: 0,
      });
    });

    it('aggregates totals, revenue, and occupancy across showtimes and bookings', async () => {
      await seedScenario();

      const stats = await adminService.getStats();
      expect(stats.totalShowtimes).toBe(2);
      expect(stats.upcomingShowtimes).toBe(1); // only the scheduled one
      expect(stats.totalBookings).toBe(2);
      expect(stats.confirmedBookings).toBe(1);
      expect(stats.cancelledBookings).toBe(1);
      expect(stats.totalRevenue).toBe(50); // only the confirmed booking counts
      expect(stats.totalSeats).toBe(3); // 2 on the scheduled showtime + 1 on the cancelled showtime
      expect(stats.bookedSeats).toBe(1);
      expect(stats.availableSeats).toBe(2);
      expect(stats.occupancyRate).toBe(Math.round((1 / 3) * 100));
    });
  });

  describe('listAdminShowtimes', () => {
    it('lists every showtime including cancelled ones, with revenue and booking count derived from confirmed bookings', async () => {
      const { showtime, cancelledShowtime } = await seedScenario();

      const result = await adminService.listAdminShowtimes({});
      expect(result.total).toBe(2);
      expect(result.items).toHaveLength(2);
      expect(result.limit).toBe(20);

      const scheduledSummary = result.items.find((s) => s.id === showtime._id.toString());
      expect(scheduledSummary.revenue).toBe(50);
      expect(scheduledSummary.bookingCount).toBe(1);

      const cancelledSummary = result.items.find((s) => s.id === cancelledShowtime._id.toString());
      expect(cancelledSummary.status).toBe('cancelled');
      expect(cancelledSummary.revenue).toBe(0);
      expect(cancelledSummary.bookingCount).toBe(0);
    });

    it('paginates results', async () => {
      await seedScenario();
      const page1 = await adminService.listAdminShowtimes({ page: 1, limit: 1 });
      expect(page1.items).toHaveLength(1);
      expect(page1.totalPages).toBe(2);
      expect(page1.limit).toBe(1);
    });
  });
});
