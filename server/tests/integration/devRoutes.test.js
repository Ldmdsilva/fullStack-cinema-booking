import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';

let app;
let sendEmail;

describe('GET /api/dev/last-mail (D13 — dev-only last-sent-mail lookup)', () => {
  beforeAll(async () => {
    await connectTestDB();
    app = (await import('../../src/app.js')).default;
    ({ sendEmail } = await import('../../src/services/notification/emailService.js'));
  });

  afterAll(async () => {
    await closeTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  it('returns 400 VALIDATION_ERROR when the email query parameter is missing', async () => {
    const res = await request(app).get('/api/dev/last-mail');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 MAIL_NOT_FOUND when no mail has been sent to that address', async () => {
    const res = await request(app).get('/api/dev/last-mail').query({ email: 'nobody@example.com' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('MAIL_NOT_FOUND');
  });

  it('returns 200 with the last email sent to that address', async () => {
    await sendEmail({
      to: 'fan@example.com',
      subject: 'Verify your Encore Cinemas account',
      html: '<p>verify me</p>',
      text: 'verify me',
    });

    const res = await request(app).get('/api/dev/last-mail').query({ email: 'fan@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.to).toBe('fan@example.com');
    expect(res.body.subject).toBe('Verify your Encore Cinemas account');
    expect(res.body.html).toBe('<p>verify me</p>');
    expect(res.body.text).toBe('verify me');
  });

  it('looks up the address case-insensitively', async () => {
    await sendEmail({
      to: 'Mixed.Case@Example.com',
      subject: 'Reset your Encore Cinemas password',
      html: '<p>reset me</p>',
      text: 'reset me',
    });

    const res = await request(app).get('/api/dev/last-mail').query({ email: 'mixed.case@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.subject).toBe('Reset your Encore Cinemas password');
  });

  // NODE_ENV is fixed to 'test' for the whole suite via tests/helpers/db.js
  // (and shared across every test file in this Jest process), so it can't be
  // toggled per-test without module-cache gymnastics (jest.resetModules() +
  // re-mocking config/env.js, as emailService.transport.test.js does for a
  // different reason). The production-mount guard in app.js is a simple
  // `if (env.NODE_ENV !== 'production') { app.use('/api/dev', devRoutes); }`
  // and is not independently exercised here; it is covered by inspection.
});
