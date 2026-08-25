import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import User from '../../src/models/User.js';
import Cinema from '../../src/models/Cinema.js';

let app;

async function createAdminAndLogin() {
  const passwordHash = await bcrypt.hash('adminPassword123', 10);
  await User.create({
    name: 'Admin Boss',
    email: 'admin@cinemas.test',
    passwordHash,
    phone: '94771234567',
    role: 'admin',
    emailVerified: true,
  });

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@cinemas.test', password: 'adminPassword123' });

  return res.body.token;
}

async function createCustomerAndLogin() {
  const passwordHash = await bcrypt.hash('customerPassword123', 10);
  await User.create({
    name: 'Regular Customer',
    email: 'customer@cinemas.test',
    passwordHash,
    phone: '94777654321',
    role: 'customer',
    emailVerified: true,
  });

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'customer@cinemas.test', password: 'customerPassword123' });

  return res.body.token;
}

function buildSeatLayout(count, prefix = 'A') {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i + 1}`,
    section: 'STANDARD',
    row: prefix,
    number: i + 1,
  }));
}

function cinemaPayload(overrides = {}) {
  return {
    name: 'Encore Cineplex',
    address: '10 Galle Road',
    city: 'Colombo',
    screens: [
      { screenId: '1', name: 'Screen 1', seatLayout: buildSeatLayout(3, 'A') },
      { screenId: '2', name: 'Screen 2', seatLayout: buildSeatLayout(2, 'B') },
    ],
    ...overrides,
  };
}

describe('Cinema routes — /api/cinemas (§C7.1 Catalogue, FR-23)', () => {
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

  describe('GET /api/cinemas', () => {
    it('lists cinemas publicly without auth using the {items} envelope with summary shape', async () => {
      await Cinema.create(cinemaPayload());
      await Cinema.create(cinemaPayload({ name: 'Second Cinema', city: 'Kandy' }));

      const res = await request(app).get('/api/cinemas');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('items');
      expect(res.body.items).toHaveLength(2);

      const [summary] = res.body.items;
      expect(summary).toHaveProperty('id');
      expect(summary).toHaveProperty('name');
      expect(summary).toHaveProperty('city');
      expect(summary).toHaveProperty('screenCount');
      expect(summary).toHaveProperty('totalCapacity');
      expect(summary).not.toHaveProperty('screens');
    });
  });

  describe('GET /api/cinemas/:id', () => {
    it('returns 200 with full cinema detail including screens[] and city', async () => {
      const cinema = await Cinema.create(cinemaPayload());

      const res = await request(app).get(`/api/cinemas/${cinema._id}`);

      expect(res.status).toBe(200);
      expect(res.body.cinema).toHaveProperty('id', cinema._id.toString());
      expect(res.body.cinema.city).toBe('Colombo');
      expect(res.body.cinema.screens).toHaveLength(2);
      expect(res.body.cinema.screens[0].seatLayout).toHaveLength(3);
    });

    it('returns 404 CINEMA_NOT_FOUND when the cinema does not exist', async () => {
      const res = await request(app).get('/api/cinemas/64b64b64b64b64b64b64b64b');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('CINEMA_NOT_FOUND');
    });
  });

  describe('POST /api/cinemas', () => {
    it('returns 401 when no token is provided', async () => {
      const res = await request(app).post('/api/cinemas').send(cinemaPayload());
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 403 when a non-admin (customer) token is provided', async () => {
      const customerToken = await createCustomerAndLogin();

      const res = await request(app)
        .post('/api/cinemas')
        .set('Authorization', `Bearer ${customerToken}`)
        .send(cinemaPayload());

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('creates a cinema as admin and returns 201', async () => {
      const adminToken = await createAdminAndLogin();

      const res = await request(app)
        .post('/api/cinemas')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(cinemaPayload());

      expect(res.status).toBe(201);
      expect(res.body.cinema).toHaveProperty('id');
      expect(res.body.cinema.name).toBe('Encore Cineplex');
      expect(res.body.cinema.screens).toHaveLength(2);

      const stored = await Cinema.findById(res.body.cinema.id);
      expect(stored).not.toBeNull();
    });

    it('returns 400 VALIDATION_ERROR for a missing required field', async () => {
      const adminToken = await createAdminAndLogin();

      const res = await request(app)
        .post('/api/cinemas')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(cinemaPayload({ city: undefined }));

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for a screen exceeding the 300-seat cap (§C6.2, ADR-002 action 1)', async () => {
      const adminToken = await createAdminAndLogin();

      const res = await request(app)
        .post('/api/cinemas')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(
          cinemaPayload({
            screens: [{ screenId: '1', name: 'Mega Screen', seatLayout: buildSeatLayout(301) }],
          })
        );

      expect(res.status).toBe(400);
    });

    it('returns 400 for duplicate screenIds within the payload', async () => {
      const adminToken = await createAdminAndLogin();

      const res = await request(app)
        .post('/api/cinemas')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(
          cinemaPayload({
            screens: [
              { screenId: '1', name: 'Screen 1', seatLayout: buildSeatLayout(2, 'A') },
              { screenId: '1', name: 'Screen 1 Dup', seatLayout: buildSeatLayout(2, 'B') },
            ],
          })
        );

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PATCH /api/cinemas/:id', () => {
    it('updates a cinema as admin and returns 200', async () => {
      const adminToken = await createAdminAndLogin();
      const cinema = await Cinema.create(cinemaPayload());

      const res = await request(app)
        .patch(`/api/cinemas/${cinema._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Updated Cineplex' });

      expect(res.status).toBe(200);
      expect(res.body.cinema.name).toBe('Updated Cineplex');
    });

    it('returns 403 when a non-admin token is provided', async () => {
      const customerToken = await createCustomerAndLogin();
      const cinema = await Cinema.create(cinemaPayload());

      const res = await request(app)
        .patch(`/api/cinemas/${cinema._id}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ name: 'Updated Cineplex' });

      expect(res.status).toBe(403);
    });

    it('returns 404 CINEMA_NOT_FOUND for a non-existent cinema', async () => {
      const adminToken = await createAdminAndLogin();

      const res = await request(app)
        .patch('/api/cinemas/64b64b64b64b64b64b64b64b')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Updated Cineplex' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('CINEMA_NOT_FOUND');
    });
  });

  describe('DELETE /api/cinemas/:id', () => {
    it('returns 401 when no token is provided', async () => {
      const cinema = await Cinema.create(cinemaPayload());
      const res = await request(app).delete(`/api/cinemas/${cinema._id}`);
      expect(res.status).toBe(401);
    });

    it('returns 403 when a non-admin token is provided', async () => {
      const customerToken = await createCustomerAndLogin();
      const cinema = await Cinema.create(cinemaPayload());

      const res = await request(app)
        .delete(`/api/cinemas/${cinema._id}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
    });

    it('deletes a cinema as admin and returns 204', async () => {
      const adminToken = await createAdminAndLogin();
      const cinema = await Cinema.create(cinemaPayload());

      const res = await request(app)
        .delete(`/api/cinemas/${cinema._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(204);

      const stored = await Cinema.findById(cinema._id);
      expect(stored).toBeNull();
    });

    it('returns 404 CINEMA_NOT_FOUND for a non-existent cinema', async () => {
      const adminToken = await createAdminAndLogin();

      const res = await request(app)
        .delete('/api/cinemas/64b64b64b64b64b64b64b64b')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('CINEMA_NOT_FOUND');
    });
  });
});
