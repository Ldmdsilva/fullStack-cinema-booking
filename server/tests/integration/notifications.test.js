import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';

/**
 * emailService.js and smsService.js must be mocked before the dynamic
 * import of notificationService.js below, since it imports `sendEmail`/
 * `sendSms` directly (ADR-012: notifications are fire-and-forget and must
 * never be able to fail the operation that triggered them).
 */
const sendEmailMock = jest.fn(async () => ({ messageId: 'mock-message-id' }));
const sendSmsMock = jest.fn(async () => ({ status: 'success', data: 'Sent' }));

jest.unstable_mockModule('../../src/services/notification/emailService.js', () => ({
  sendEmail: sendEmailMock,
}));
jest.unstable_mockModule('../../src/services/notification/smsService.js', () => ({
  sendSms: sendSmsMock,
}));

let notificationService;

const user = { name: 'Fan One', email: 'fan@example.com', phone: '94771234567' };
const bookingFixture = {
  reference: 'ENC-1234',
  seats: [{ section: 'Stalls', row: 'A', number: 1, price: 6500 }],
  totalPrice: 6500,
};
const eventFixture = { title: 'Gig Night', date: new Date() };
const venueFixture = { name: 'Grand Hall', city: 'Colombo' };

describe('notification/notificationService.js — fire-and-forget guarantees (ADR-012)', () => {
  beforeAll(async () => {
    notificationService = await import('../../src/services/notification/notificationService.js');
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('notifyBookingConfirmed fires exactly one email and one SMS, addressed to the user', async () => {
    notificationService.notifyBookingConfirmed({
      user,
      booking: bookingFixture,
      event: eventFixture,
      venue: venueFixture,
    });

    // Fire-and-forget: give the internal (un-awaited) promises a tick to settle.
    await new Promise((resolve) => setImmediate(resolve));

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendSmsMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0].to).toBe(user.email);
    expect(sendSmsMock.mock.calls[0][0]).toBe(user.phone);
  });

  it('a rejecting sendEmail never throws/propagates out of notifyBookingConfirmed, and the SMS still fires', async () => {
    sendEmailMock.mockRejectedValueOnce(new Error('SMTP connection refused'));

    expect(() =>
      notificationService.notifyBookingConfirmed({ user, booking: bookingFixture, event: eventFixture, venue: venueFixture })
    ).not.toThrow();

    await new Promise((resolve) => setImmediate(resolve));
    expect(sendSmsMock).toHaveBeenCalledTimes(1);
  });

  it('a rejecting sendSms never throws/propagates out of notifyBookingConfirmed, and the email still fires', async () => {
    sendSmsMock.mockRejectedValueOnce(new Error('notify.lk unreachable'));

    expect(() =>
      notificationService.notifyBookingConfirmed({ user, booking: bookingFixture, event: eventFixture, venue: venueFixture })
    ).not.toThrow();

    await new Promise((resolve) => setImmediate(resolve));
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it('notifyVerifyEmail and notifyPasswordReset fire an email only, without throwing', async () => {
    expect(() =>
      notificationService.notifyVerifyEmail({ user, verifyUrl: 'https://encore.live/verify?token=abc' })
    ).not.toThrow();
    expect(() =>
      notificationService.notifyPasswordReset({ user, resetUrl: 'https://encore.live/reset?token=abc' })
    ).not.toThrow();

    await new Promise((resolve) => setImmediate(resolve));
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    expect(sendSmsMock).not.toHaveBeenCalled();
  });

  it('notifyBookingCancelled fires exactly one email and one SMS, without throwing', async () => {
    expect(() =>
      notificationService.notifyBookingCancelled({ user, booking: bookingFixture, refunded: true })
    ).not.toThrow();

    await new Promise((resolve) => setImmediate(resolve));
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendSmsMock).toHaveBeenCalledTimes(1);
  });
});
