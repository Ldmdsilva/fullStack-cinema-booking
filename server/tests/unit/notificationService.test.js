import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';

/**
 * emailService.js must be mocked before the dynamic import of
 * notificationService.js below, since it imports `sendEmail` directly
 * (ADR-012: notifications are fire-and-forget and must never be able to
 * fail the operation that triggered them).
 */
const sendEmailMock = jest.fn(async () => ({ messageId: 'mock-message-id' }));

jest.unstable_mockModule('../../src/services/notification/emailService.js', () => ({
  sendEmail: sendEmailMock,
}));

let notificationService;

const user = { name: 'Fan One', email: 'fan@example.com', phone: '94771234567' };

describe('notification/notificationService.js — notifyVerifyEmail / notifyPasswordReset (D13)', () => {
  beforeAll(async () => {
    notificationService = await import('../../src/services/notification/notificationService.js');
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('notifyVerifyEmail sends exactly one email, addressed to the user, linking to verifyUrl', async () => {
    notificationService.notifyVerifyEmail({ user, verifyUrl: 'https://encore.live/verify?token=abc123' });

    await new Promise((resolve) => setImmediate(resolve));

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const call = sendEmailMock.mock.calls[0][0];
    expect(call.to).toBe(user.email);
    expect(call.subject.toLowerCase()).toContain('verify');
    expect(call.html).toContain('https://encore.live/verify?token=abc123');
    expect(call.text).toContain('https://encore.live/verify?token=abc123');
  });

  it('notifyPasswordReset sends exactly one email, addressed to the user, linking to resetUrl', async () => {
    notificationService.notifyPasswordReset({ user, resetUrl: 'https://encore.live/reset?token=xyz789' });

    await new Promise((resolve) => setImmediate(resolve));

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const call = sendEmailMock.mock.calls[0][0];
    expect(call.to).toBe(user.email);
    expect(call.subject.toLowerCase()).toContain('reset');
    expect(call.html).toContain('https://encore.live/reset?token=xyz789');
    expect(call.text).toContain('https://encore.live/reset?token=xyz789');
  });

  it('a rejecting sendEmail never throws/propagates out of notifyVerifyEmail', async () => {
    sendEmailMock.mockRejectedValueOnce(new Error('SMTP connection refused'));

    expect(() =>
      notificationService.notifyVerifyEmail({ user, verifyUrl: 'https://encore.live/verify?token=abc' })
    ).not.toThrow();

    await new Promise((resolve) => setImmediate(resolve));
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it('a rejecting sendEmail never throws/propagates out of notifyPasswordReset', async () => {
    sendEmailMock.mockRejectedValueOnce(new Error('SMTP connection refused'));

    expect(() =>
      notificationService.notifyPasswordReset({ user, resetUrl: 'https://encore.live/reset?token=abc' })
    ).not.toThrow();

    await new Promise((resolve) => setImmediate(resolve));
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });
});
