import { jest } from '@jest/globals';

/**
 * Shared ESM-mocking helpers (Phase 7 risk callout).
 *
 * The server is pure ESM run under `--experimental-vm-modules`, so mocking
 * `stripe`/`nodemailer` requires `jest.unstable_mockModule` to run BEFORE the
 * dynamic `import()` of any module that transitively imports them. The usual
 * pattern in a test file is:
 *
 *   import { createStripeMock, mockStripeModule } from '../helpers/mocks.js';
 *
 *   const stripeMock = createStripeMock();
 *   mockStripeModule(stripeMock);
 *
 *   let bookingService;
 *   beforeAll(async () => {
 *     bookingService = await import('../../src/services/bookingService.js');
 *   });
 *
 * Because `jest.unstable_mockModule` just registers the mock (it isn't
 * hoisted like `jest.mock`), calling it from this helper works fine as long
 * as the helper call happens — in source order — before the dynamic
 * `import()` of the module under test in the same test file.
 */

/**
 * Build a fake Stripe client covering the surface `paymentService.js`
 * actually calls: `checkout.sessions.create`, `checkout.sessions.expire`,
 * `checkout.sessions.retrieve`, `refunds.create`, `webhooks.constructEvent`,
 * `webhooks.generateTestHeaderString`, `paymentIntents.create`,
 * `paymentIntents.cancel`, `paymentIntents.retrieve`, `paymentIntents.list`.
 * @param {object} [overrides] - deep-merged onto the default mock's leaf functions
 * @returns {object}
 */
export function createStripeMock(overrides = {}) {
  const base = {
    checkout: {
      sessions: {
        create: jest.fn(async () => ({
          id: 'cs_test_mock_session',
          client_secret: 'secret_mock_client_secret',
          status: 'open',
          amount_total: 0,
          currency: 'lkr',
        })),
        expire: jest.fn(async (id) => ({ id, status: 'expired' })),
        retrieve: jest.fn(async (id) => ({
          id,
          status: 'open',
          payment_status: 'unpaid',
          amount_total: 0,
          currency: 'lkr',
          payment_intent: null,
        })),
      },
    },
    refunds: {
      create: jest.fn(async () => ({ id: 're_test_mock_refund' })),
    },
    webhooks: {
      constructEvent: jest.fn(),
      generateTestHeaderString: jest.fn(() => 't=1,v1=mock_signature'),
    },
    paymentIntents: {
      create: jest.fn(async () => ({
        id: 'pi_test_mock_intent',
        client_secret: 'pi_test_mock_intent_secret',
        status: 'requires_payment_method',
      })),
      cancel: jest.fn(async (id) => ({ id, status: 'canceled' })),
      retrieve: jest.fn(async (id) => ({
        id,
        client_secret: `${id}_secret`,
        status: 'requires_payment_method',
      })),
      list: jest.fn(async () => ({ data: [] })),
    },
  };

  return {
    checkout: {
      sessions: { ...base.checkout.sessions, ...(overrides.checkout?.sessions || {}) },
    },
    refunds: { ...base.refunds, ...(overrides.refunds || {}) },
    webhooks: { ...base.webhooks, ...(overrides.webhooks || {}) },
    paymentIntents: {
      ...base.paymentIntents,
      ...(overrides.paymentIntents || {}),
    },
  };
}

/**
 * Register a mock for the `stripe` package so any module dynamically
 * imported afterwards receives `stripeMockInstance` from `new Stripe(...)`.
 * Must be called before any dynamic `import()` of `src/config/stripe.js` (or
 * anything that imports it) in the same test file.
 * @param {object} stripeMockInstance - from createStripeMock()
 */
export function mockStripeModule(stripeMockInstance) {
  jest.unstable_mockModule('stripe', () => ({
    default: jest.fn(() => stripeMockInstance),
  }));
}

/**
 * Build a fake nodemailer transporter/module. `sendMail` defaults to
 * resolving with a jsonTransport-shaped info object.
 * @param {object} [overrides]
 * @returns {{ sendMailMock: jest.Mock, nodemailerMock: object }}
 */
export function createNodemailerMock(overrides = {}) {
  const sendMailMock = jest.fn(
    overrides.sendMail ||
      (async (mail) => ({
        messageId: 'mock-message-id',
        envelope: { from: mail.from, to: [mail.to] },
        message: JSON.stringify(mail),
      }))
  );

  const nodemailerMock = {
    createTransport: jest.fn(() => ({ sendMail: sendMailMock })),
    createTestAccount: jest.fn(async () => ({
      user: 'ethereal-user',
      pass: 'ethereal-pass',
      smtp: { host: 'smtp.ethereal.email', port: 587, secure: false },
    })),
    getTestMessageUrl: jest.fn(() => null),
  };

  return { sendMailMock, nodemailerMock };
}

/**
 * Register a mock for the `nodemailer` package. Must be called before any
 * dynamic `import()` of `src/services/notification/emailService.js` (or
 * anything that imports it) in the same test file.
 * @param {object} nodemailerMock - from createNodemailerMock()
 */
export function mockNodemailerModule(nodemailerMock) {
  jest.unstable_mockModule('nodemailer', () => ({
    default: nodemailerMock,
  }));
}
