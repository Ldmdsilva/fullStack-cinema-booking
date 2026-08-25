import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import User from '../../src/models/User.js';
import Film from '../../src/models/Film.js';

let app;

async function createAdminAndLogin() {
  const passwordHash = await bcrypt.hash('adminPassword123', 10);
  await User.create({
    name: 'Admin Boss',
    email: 'admin@films.test',
    passwordHash,
    phone: '94771234567',
    role: 'admin',
    emailVerified: true,
  });

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@films.test', password: 'adminPassword123' });

  return res.body.token;
}

async function createCustomerAndLogin() {
  const passwordHash = await bcrypt.hash('customerPassword123', 10);
  await User.create({
    name: 'Regular Customer',
    email: 'customer@films.test',
    passwordHash,
    phone: '94777654321',
    role: 'customer',
    emailVerified: true,
  });

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'customer@films.test', password: 'customerPassword123' });

  return res.body.token;
}

function filmPayload(overrides = {}) {
  return {
    title: 'The Great Adventure',
    synopsis: 'A hero sets out on a journey.',
    certificate: 'PG',
    runtimeMinutes: 120,
    genre: ['Action', 'Adventure'],
    posterUrl: 'https://example.com/poster.jpg',
    releaseDate: new Date(Date.now() + 86400000 * 30).toISOString(),
    ...overrides,
  };
}

describe('Film routes — /api/films (§C7.1 Catalogue)', () => {
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

  describe('GET /api/films', () => {
    it('lists films publicly without auth using the {items,total,page,limit,totalPages} envelope', async () => {
      await Film.create(filmPayload());
      await Film.create(filmPayload({ title: 'Second Film', genre: ['Comedy'] }));

      const res = await request(app).get('/api/films');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('total', 2);
      expect(res.body).toHaveProperty('page', 1);
      expect(res.body).toHaveProperty('limit');
      expect(res.body).toHaveProperty('totalPages');
      expect(res.body.items).toHaveLength(2);
    });

    it('filters by genre', async () => {
      await Film.create(filmPayload({ genre: ['Action'] }));
      await Film.create(filmPayload({ title: 'Comedy Film', genre: ['Comedy'] }));

      const res = await request(app).get('/api/films').query({ genre: 'Comedy' });

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0].title).toBe('Comedy Film');
    });
  });

  describe('GET /api/films/:id', () => {
    it('returns 200 with the film detail when found', async () => {
      const film = await Film.create(filmPayload());

      const res = await request(app).get(`/api/films/${film._id}`);

      expect(res.status).toBe(200);
      expect(res.body.film).toHaveProperty('id', film._id.toString());
      expect(res.body.film.title).toBe(film.title);
    });

    it('returns 404 FILM_NOT_FOUND when the film does not exist', async () => {
      const res = await request(app).get('/api/films/64b64b64b64b64b64b64b64b');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('FILM_NOT_FOUND');
    });
  });

  describe('POST /api/films', () => {
    it('returns 401 when no token is provided', async () => {
      const res = await request(app).post('/api/films').send(filmPayload());
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 403 when a non-admin (customer) token is provided', async () => {
      const customerToken = await createCustomerAndLogin();

      const res = await request(app)
        .post('/api/films')
        .set('Authorization', `Bearer ${customerToken}`)
        .send(filmPayload());

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('creates a film as admin and returns 201', async () => {
      const adminToken = await createAdminAndLogin();

      const res = await request(app)
        .post('/api/films')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(filmPayload());

      expect(res.status).toBe(201);
      expect(res.body.film).toHaveProperty('id');
      expect(res.body.film.title).toBe('The Great Adventure');

      const stored = await Film.findById(res.body.film.id);
      expect(stored).not.toBeNull();
    });

    it('returns 400 VALIDATION_ERROR for invalid payloads', async () => {
      const adminToken = await createAdminAndLogin();

      const res = await request(app)
        .post('/api/films')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(filmPayload({ genre: [] }));

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PUT /api/films/:id', () => {
    it('updates a film as admin and returns 200', async () => {
      const adminToken = await createAdminAndLogin();
      const film = await Film.create(filmPayload());

      const res = await request(app)
        .put(`/api/films/${film._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Updated Title' });

      expect(res.status).toBe(200);
      expect(res.body.film.title).toBe('Updated Title');
    });

    it('returns 403 when a non-admin token is provided', async () => {
      const customerToken = await createCustomerAndLogin();
      const film = await Film.create(filmPayload());

      const res = await request(app)
        .put(`/api/films/${film._id}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ title: 'Updated Title' });

      expect(res.status).toBe(403);
    });

    it('returns 404 FILM_NOT_FOUND for a non-existent film', async () => {
      const adminToken = await createAdminAndLogin();

      const res = await request(app)
        .put('/api/films/64b64b64b64b64b64b64b64b')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Updated Title' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('FILM_NOT_FOUND');
    });
  });

  describe('DELETE /api/films/:id', () => {
    it('returns 401 when no token is provided', async () => {
      const film = await Film.create(filmPayload());
      const res = await request(app).delete(`/api/films/${film._id}`);
      expect(res.status).toBe(401);
    });

    it('returns 403 when a non-admin token is provided', async () => {
      const customerToken = await createCustomerAndLogin();
      const film = await Film.create(filmPayload());

      const res = await request(app)
        .delete(`/api/films/${film._id}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
    });

    it('deletes a film as admin and returns 204', async () => {
      const adminToken = await createAdminAndLogin();
      const film = await Film.create(filmPayload());

      const res = await request(app)
        .delete(`/api/films/${film._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(204);

      const stored = await Film.findById(film._id);
      expect(stored).toBeNull();
    });

    it('returns 404 FILM_NOT_FOUND for a non-existent film', async () => {
      const adminToken = await createAdminAndLogin();

      const res = await request(app)
        .delete('/api/films/64b64b64b64b64b64b64b64b')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('FILM_NOT_FOUND');
    });
  });
});
