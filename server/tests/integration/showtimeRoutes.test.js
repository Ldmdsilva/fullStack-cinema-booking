import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import User from '../../src/models/User.js';
import Film from '../../src/models/Film.js';
import Cinema from '../../src/models/Cinema.js';
import Showtime from '../../src/models/Showtime.js';

let app;

async function createAdminAndLogin() {
  const passwordHash = await bcrypt.hash('adminPassword123', 10);
  await User.create({
    name: 'Admin Boss',
    email: 'admin@showtimes.test',
    passwordHash,
    phone: '94771234567',
    role: 'admin',
    emailVerified: true,
  });

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@showtimes.test', password: 'adminPassword123' });

  return res.body.token;
}

async function createCustomerAndLogin() {
  const passwordHash = await bcrypt.hash('customerPassword123', 10);
  await User.create({
    name: 'Regular Customer',
    email: 'customer@showtimes.test',
    passwordHash,
    phone: '94777654321',
    role: 'customer',
    emailVerified: true,
  });

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'customer@showtimes.test', password: 'customerPassword123' });

  return res.body.token;
}

async function createFilm() {
  return Film.create({
    title: 'The Great Adventure',
    synopsis: 'A hero sets out on a journey.',
    certificate: 'PG',
    runtimeMinutes: 120,
    genre: ['Action'],
    releaseDate: new Date(Date.now() - 86400000),
  });
}

async function createCinema() {
  return Cinema.create({
    name: 'Encore Cineplex',
    address: '10 Galle Road',
    city: 'Colombo',
    screens: [
      {
        screenId: '1',
        name: 'Screen 1',
        seatLayout: [
          { id: 'A1', section: 'standard', row: 'A', number: 1 },
          { id: 'B1', section: 'premium', row: 'B', number: 1 },
        ],
      },
    ],
  });
}

function showtimePayload(film, cinema, overrides = {}) {
  return {
    filmRef: film._id.toString(),
    cinemaRef: cinema._id.toString(),
    screenId: '1',
    startsAt: new Date(Date.now() + 86400000).toISOString(),
    basePrice: 1000,
    ...overrides,
  };
}

describe('Showtime routes — /api/showtimes (§C7.1 Catalogue, FR-19–21, FR-24)', () => {
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

  describe('GET /api/showtimes', () => {
    it('lists upcoming showtimes publicly using the {items,total,page,limit,totalPages} envelope', async () => {
      const film = await createFilm();
      const cinema = await createCinema();
      const adminToken = await createAdminAndLogin();

      await request(app)
        .post('/api/showtimes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(showtimePayload(film, cinema));

      const res = await request(app).get('/api/showtimes');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('items');
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0]).toHaveProperty('availableSeats');
      expect(res.body.items[0]).not.toHaveProperty('seats');
      expect(res.body.items[0].film).toHaveProperty('title', 'The Great Adventure');
      expect(res.body.items[0].cinema).toHaveProperty('city', 'Colombo');
    });

    it('filters by filmId and cinemaId', async () => {
      const film = await createFilm();
      const cinema = await createCinema();
      const adminToken = await createAdminAndLogin();

      await request(app)
        .post('/api/showtimes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(showtimePayload(film, cinema));

      const res = await request(app).get('/api/showtimes').query({ filmId: film._id.toString() });
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);

      const noMatch = await request(app)
        .get('/api/showtimes')
        .query({ filmId: '64b64b64b64b64b64b64b64b' });
      expect(noMatch.body.total).toBe(0);
    });
  });

  describe('GET /api/showtimes/:id', () => {
    it('returns 200 with the full seat map', async () => {
      const film = await createFilm();
      const cinema = await createCinema();
      const adminToken = await createAdminAndLogin();

      const created = await request(app)
        .post('/api/showtimes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(showtimePayload(film, cinema));

      const res = await request(app).get(`/api/showtimes/${created.body.showtime.id}`);

      expect(res.status).toBe(200);
      expect(res.body.seats).toHaveLength(2);
      expect(res.body.seats.find((s) => s.id === 'B1').tier).toBe('PREMIUM');
      expect(res.body.showtime.seats).toBeUndefined();
    });

    it('returns 404 SHOWTIME_NOT_FOUND for a non-existent showtime', async () => {
      const res = await request(app).get('/api/showtimes/64b64b64b64b64b64b64b64b');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('SHOWTIME_NOT_FOUND');
    });
  });

  describe('POST /api/showtimes', () => {
    it('returns 401 when no token is provided', async () => {
      const film = await createFilm();
      const cinema = await createCinema();
      const res = await request(app).post('/api/showtimes').send(showtimePayload(film, cinema));
      expect(res.status).toBe(401);
    });

    it('returns 403 when a non-admin (customer) token is provided', async () => {
      const film = await createFilm();
      const cinema = await createCinema();
      const customerToken = await createCustomerAndLogin();

      const res = await request(app)
        .post('/api/showtimes')
        .set('Authorization', `Bearer ${customerToken}`)
        .send(showtimePayload(film, cinema));

      expect(res.status).toBe(403);
    });

    it('creates a showtime as admin and returns 201 with tiered seat prices', async () => {
      const film = await createFilm();
      const cinema = await createCinema();
      const adminToken = await createAdminAndLogin();

      const res = await request(app)
        .post('/api/showtimes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(showtimePayload(film, cinema));

      expect(res.status).toBe(201);
      expect(res.body.showtime.screenName).toBe('Screen 1');
      const seatA1 = res.body.showtime.seats.find((s) => s.id === 'A1');
      const seatB1 = res.body.showtime.seats.find((s) => s.id === 'B1');
      expect(seatA1.tier).toBe('STANDARD');
      expect(seatA1.price).toBe(1000);
      expect(seatB1.tier).toBe('PREMIUM');
      expect(seatB1.price).toBe(1350);

      const stored = await Showtime.findById(res.body.showtime.id);
      expect(stored).not.toBeNull();
    });

    it('returns 400 VALIDATION_ERROR for a malformed filmRef', async () => {
      const cinema = await createCinema();
      const adminToken = await createAdminAndLogin();

      const res = await request(app)
        .post('/api/showtimes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(showtimePayload({ _id: 'not-an-object-id' }, cinema));

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 FILM_NOT_FOUND when filmRef does not resolve', async () => {
      const cinema = await createCinema();
      const adminToken = await createAdminAndLogin();

      const res = await request(app)
        .post('/api/showtimes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(showtimePayload({ _id: '64b64b64b64b64b64b64b64b' }, cinema));

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('FILM_NOT_FOUND');
    });

    it('returns 404 CINEMA_NOT_FOUND when cinemaRef does not resolve', async () => {
      const film = await createFilm();
      const adminToken = await createAdminAndLogin();

      const res = await request(app)
        .post('/api/showtimes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(showtimePayload(film, { _id: '64b64b64b64b64b64b64b64b' }));

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('CINEMA_NOT_FOUND');
    });
  });

  describe('PATCH /api/showtimes/:id/cancel', () => {
    it('returns 401 when no token is provided', async () => {
      const film = await createFilm();
      const cinema = await createCinema();
      const adminToken = await createAdminAndLogin();
      const created = await request(app)
        .post('/api/showtimes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(showtimePayload(film, cinema));

      const res = await request(app).patch(`/api/showtimes/${created.body.showtime.id}/cancel`);
      expect(res.status).toBe(401);
    });

    it('returns 403 when a non-admin token is provided', async () => {
      const film = await createFilm();
      const cinema = await createCinema();
      const adminToken = await createAdminAndLogin();
      const customerToken = await createCustomerAndLogin();
      const created = await request(app)
        .post('/api/showtimes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(showtimePayload(film, cinema));

      const res = await request(app)
        .patch(`/api/showtimes/${created.body.showtime.id}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`);
      expect(res.status).toBe(403);
    });

    it('cancels a showtime as admin and returns 200', async () => {
      const film = await createFilm();
      const cinema = await createCinema();
      const adminToken = await createAdminAndLogin();
      const created = await request(app)
        .post('/api/showtimes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(showtimePayload(film, cinema));

      const res = await request(app)
        .patch(`/api/showtimes/${created.body.showtime.id}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.showtime.status).toBe('cancelled');

      const stored = await Showtime.findById(created.body.showtime.id);
      expect(stored.status).toBe('cancelled');
    });

    it('returns 404 SHOWTIME_NOT_FOUND for a non-existent showtime', async () => {
      const adminToken = await createAdminAndLogin();

      const res = await request(app)
        .patch('/api/showtimes/64b64b64b64b64b64b64b64b/cancel')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('SHOWTIME_NOT_FOUND');
    });
  });
});
