import { describe, it, expect, beforeAll, beforeEach, afterAll, jest } from '@jest/globals';
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import { createStripeMock, mockStripeModule } from '../helpers/mocks.js';

// Stripe must be mocked before the dynamic import of paymentService.js below.
const stripeMock = createStripeMock();
mockStripeModule(stripeMock);

let paymentService;

describe('services/paymentService.js — §C7.3 adapter (ADR-014)', () => {
  beforeAll(async () => {
    await connectTestDB();
    paymentService = await import('../../src/services/paymentService.js');
  });

  afterAll(async () => {
    await closeTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
    jest.clearAllMocks();
  });

  describe('toMinorUnits', () => {
    it('converts a major-unit LKR amount to the integer minor-unit form Stripe expects', () => {
      expect(paymentService.toMinorUnits(6500)).toBe(650000);
      expect(paymentService.toMinorUnits(0)).toBe(0);
      expect(paymentService.toMinorUnits(99.5)).toBe(9950);
    });

    it('rounds fractional minor units rather than truncating or throwing', () => {
      expect(paymentService.toMinorUnits(10.005)).toBe(1001); // 1000.5 -> rounds to 1001
    });
  });

  describe('createIntent (ADR-014 / D12)', () => {
    it('creates a PaymentIntent with the amount/currency/metadata.holdId and an idempotency key equal to the holdId', async () => {
      const intent = await paymentService.createIntent({
        holdId: 'hold_test_1',
        amountMinor: 650000,
        currency: 'lkr',
      });

      expect(stripeMock.paymentIntents.create).toHaveBeenCalledTimes(1);
      const [payload, options] = stripeMock.paymentIntents.create.mock.calls[0];

      expect(payload.amount).toBe(650000);
      expect(payload.currency).toBe('lkr');
      expect(payload.metadata).toEqual({ holdId: 'hold_test_1' });
      expect(payload.automatic_payment_methods).toEqual({ enabled: true });
      expect(options).toEqual({ idempotencyKey: 'hold_test_1' });
      expect(intent.id).toBe('pi_test_mock_intent');
    });
  });

  describe('cancelIntent', () => {
    it('cancels the PaymentIntent by id', async () => {
      const result = await paymentService.cancelIntent('pi_test_456');
      expect(stripeMock.paymentIntents.cancel).toHaveBeenCalledWith('pi_test_456');
      expect(result.id).toBe('pi_test_456');
      expect(result.status).toBe('canceled');
    });
  });

  describe('retrieveIntent (ADR-014 / §C7.3)', () => {
    it('retrieves the PaymentIntent by id', async () => {
      const intent = await paymentService.retrieveIntent('pi_test_retrieve');
      expect(stripeMock.paymentIntents.retrieve).toHaveBeenCalledWith('pi_test_retrieve');
      expect(intent.id).toBe('pi_test_retrieve');
    });
  });

  describe('refundPayment', () => {
    it('creates a Stripe refund for the given payment intent', async () => {
      const refund = await paymentService.refundPayment('pi_test_123');
      expect(stripeMock.refunds.create).toHaveBeenCalledWith({ payment_intent: 'pi_test_123' });
      expect(refund.id).toBe('re_test_mock_refund');
    });
  });

  describe('refund (alias for refundPayment, §C7.3 naming)', () => {
    it('is the same function as refundPayment and creates a Stripe refund', async () => {
      expect(paymentService.refund).toBe(paymentService.refundPayment);
      const refundResult = await paymentService.refund('pi_test_alias');
      expect(stripeMock.refunds.create).toHaveBeenCalledWith({ payment_intent: 'pi_test_alias' });
      expect(refundResult.id).toBe('re_test_mock_refund');
    });
  });

  describe('listSucceededSince (ADR-014 / §C7.3)', () => {
    it('lists PaymentIntents created at or after the given Date, filtered to only succeeded ones', async () => {
      const since = new Date('2026-01-01T00:00:00Z');
      const expectedGte = Math.floor(since.getTime() / 1000);
      stripeMock.paymentIntents.list.mockResolvedValueOnce({
        data: [
          { id: 'pi_succeeded_1', status: 'succeeded' },
          { id: 'pi_pending_1', status: 'requires_payment_method' },
          { id: 'pi_succeeded_2', status: 'succeeded' },
          { id: 'pi_canceled_1', status: 'canceled' },
        ],
      });

      const result = await paymentService.listSucceededSince(since);

      expect(stripeMock.paymentIntents.list).toHaveBeenCalledWith({ created: { gte: expectedGte }, limit: 100 });
      expect(result).toHaveLength(2);
      expect(result.map((pi) => pi.id)).toEqual(['pi_succeeded_1', 'pi_succeeded_2']);
    });

    it('accepts a raw epoch-seconds number instead of a Date', async () => {
      stripeMock.paymentIntents.list.mockResolvedValueOnce({ data: [{ id: 'pi_x', status: 'succeeded' }] });

      const result = await paymentService.listSucceededSince(1700000000);

      expect(stripeMock.paymentIntents.list).toHaveBeenCalledWith({ created: { gte: 1700000000 }, limit: 100 });
      expect(result).toHaveLength(1);
    });
  });
});
