import { describe, it, expect } from '@jest/globals';
import {
  effectiveSeatStatus,
  serializeShowtimeSummary,
  serializeShowtimeDetail,
} from '../../src/serializers/showtimeSerializer.js';

describe('showtimeSerializer — FR-31 / ADR-012 action 4 / NFR-14 choke point', () => {
  describe('effectiveSeatStatus', () => {
    it('reads a held seat as available once holdExpiresAt is in the past', () => {
      const seat = { status: 'held', holdExpiresAt: new Date(Date.now() - 1000) };
      expect(effectiveSeatStatus(seat, new Date())).toBe('available');
    });

    it('keeps a held seat held while holdExpiresAt is still in the future', () => {
      const seat = { status: 'held', holdExpiresAt: new Date(Date.now() + 60000) };
      expect(effectiveSeatStatus(seat, new Date())).toBe('held');
    });

    it('always reads a booked seat as booked regardless of holdExpiresAt', () => {
      const pastExpiry = { status: 'booked', holdExpiresAt: new Date(Date.now() - 1000) };
      const noExpiry = { status: 'booked' };
      expect(effectiveSeatStatus(pastExpiry, new Date())).toBe('booked');
      expect(effectiveSeatStatus(noExpiry, new Date())).toBe('booked');
    });

    it('reads an available seat with no holdExpiresAt as available', () => {
      const seat = { status: 'available' };
      expect(effectiveSeatStatus(seat, new Date())).toBe('available');
    });

    it('defaults `now` to the current time when omitted', () => {
      const seat = { status: 'held', holdExpiresAt: new Date(Date.now() - 1000) };
      expect(effectiveSeatStatus(seat)).toBe('available');
    });
  });

  function buildShowtime(seats) {
    return {
      id: '64b64b64b64b64b64b64b64b',
      filmRef: { id: 'film1', title: 'A Film', posterUrl: 'p.jpg', certificate: 'PG', runtimeMinutes: 100 },
      cinemaRef: { id: 'cinema1', name: 'A Cinema', city: 'Colombo' },
      screenName: 'Screen 1',
      startsAt: new Date(),
      basePrice: 500,
      status: 'scheduled',
      seats,
    };
  }

  describe('serializeShowtimeSummary — availableSeats honors expiry', () => {
    it('counts an expired-held seat as available in the availableSeats total', () => {
      const now = new Date('2030-01-01T12:00:00Z');
      const seats = [
        { id: 'A1', status: 'held', holdExpiresAt: new Date('2030-01-01T11:00:00Z') }, // expired -> available
        { id: 'A2', status: 'held', holdExpiresAt: new Date('2030-01-01T13:00:00Z') }, // still held
        { id: 'A3', status: 'booked' },
        { id: 'A4', status: 'available' },
      ];

      const summary = serializeShowtimeSummary(buildShowtime(seats), now);

      expect(summary.totalSeats).toBe(4);
      expect(summary.availableSeats).toBe(2); // A1 (expired hold) + A4
    });
  });

  describe('serializeShowtimeDetail — per-seat status honors expiry', () => {
    it('exposes derived status per seat and omits internal hold bookkeeping', () => {
      const now = new Date('2030-01-01T12:00:00Z');
      const seats = [
        {
          id: 'A1',
          section: 'Standard',
          row: 'A',
          number: 1,
          tier: 'STANDARD',
          price: 500,
          status: 'held',
          holdExpiresAt: new Date('2030-01-01T11:00:00Z'),
          holdRef: '64b64b64b64b64b64b64b64c',
        },
        {
          id: 'A2',
          section: 'Standard',
          row: 'A',
          number: 2,
          tier: 'STANDARD',
          price: 500,
          status: 'held',
          holdExpiresAt: new Date('2030-01-01T13:00:00Z'),
        },
      ];

      const detail = serializeShowtimeDetail(buildShowtime(seats), now);

      expect(detail.seats).toHaveLength(2);
      expect(detail.seats[0].status).toBe('available');
      expect(detail.seats[1].status).toBe('held');
      expect(detail.availableSeats).toBe(1);
      expect(detail.seats[0]).not.toHaveProperty('holdExpiresAt');
      expect(detail.seats[0]).not.toHaveProperty('holdRef');
    });
  });
});
