import { describe, it, expect, jest } from '@jest/globals';
import { createNodemailerMock, mockNodemailerModule } from '../helpers/mocks.js';

/**
 * emailService.js's transport selection depends on `env.NODE_ENV`/`SMTP_HOST`/
 * `EMAIL_ENABLED`, which are fixed for the whole Jest process (NODE_ENV is
 * always 'test'). To exercise the non-test branches, each test here mocks
 * `../../src/config/env.js` directly and resets the module registry so a
 * fresh `emailService.js` (with its own memoised transporter) is imported
 * per scenario.
 */
function mockEnv(overrides = {}) {
  jest.unstable_mockModule('../../src/config/env.js', () => ({
    env: {
      NODE_ENV: 'production',
      EMAIL_ENABLED: true,
      MAIL_FROM: 'Encore <no-reply@encore.live>',
      SMTP_HOST: undefined,
      SMTP_PORT: 587,
      SMTP_SECURE: false,
      SMTP_USER: undefined,
      SMTP_PASS: undefined,
      LOG_LEVEL: 'silent',
      ...overrides,
    },
  }));
}

describe('notification/emailService.js — transport selection (Phase 3)', () => {
  it('uses the configured SMTP host when SMTP_HOST is set outside test', async () => {
    jest.resetModules();
    const { sendMailMock, nodemailerMock } = createNodemailerMock();
    mockNodemailerModule(nodemailerMock);
    mockEnv({ SMTP_HOST: 'smtp.example.com', SMTP_USER: 'user', SMTP_PASS: 'pass' });

    const { sendEmail } = await import('../../src/services/notification/emailService.js');
    await sendEmail({ to: 'fan@example.com', subject: 'Hi', html: '<p/>', text: 't' });

    expect(nodemailerMock.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.example.com', auth: { user: 'user', pass: 'pass' } })
    );
    expect(sendMailMock).toHaveBeenCalled();
  });

  it('falls back to an Ethereal test account when no SMTP_HOST is configured', async () => {
    jest.resetModules();
    const { sendMailMock, nodemailerMock } = createNodemailerMock();
    mockNodemailerModule(nodemailerMock);
    mockEnv({ NODE_ENV: 'development', SMTP_HOST: undefined });

    const { sendEmail } = await import('../../src/services/notification/emailService.js');
    await sendEmail({ to: 'fan@example.com', subject: 'Hi', html: '<p/>', text: 't' });

    expect(nodemailerMock.createTestAccount).toHaveBeenCalled();
    expect(sendMailMock).toHaveBeenCalled();
  });

  it('logs a preview URL when the transporter returns one', async () => {
    jest.resetModules();
    const { nodemailerMock } = createNodemailerMock();
    nodemailerMock.getTestMessageUrl.mockReturnValue('https://ethereal.email/message/abc');
    mockNodemailerModule(nodemailerMock);
    mockEnv({ SMTP_HOST: 'smtp.example.com' });

    const { sendEmail } = await import('../../src/services/notification/emailService.js');
    const result = await sendEmail({ to: 'fan@example.com', subject: 'Hi', html: '<p/>', text: 't' });

    expect(result).toBeDefined();
    expect(nodemailerMock.getTestMessageUrl).toHaveBeenCalled();
  });

  it('skips sending entirely when EMAIL_ENABLED is false', async () => {
    jest.resetModules();
    const { sendMailMock, nodemailerMock } = createNodemailerMock();
    mockNodemailerModule(nodemailerMock);
    mockEnv({ EMAIL_ENABLED: false });

    const { sendEmail } = await import('../../src/services/notification/emailService.js');
    const result = await sendEmail({ to: 'fan@example.com', subject: 'Hi', html: '<p/>', text: 't' });

    expect(result).toBeUndefined();
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});
