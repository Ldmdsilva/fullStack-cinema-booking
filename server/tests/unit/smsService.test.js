import { describe, it, expect, afterEach, jest } from '@jest/globals';
import { sendSms } from '../../src/services/notification/smsService.js';

const originalFetch = global.fetch;

describe('notification/smsService.js — notify.lk (Phase 3, ADR-012)', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  // Note: `env.SMS_ENABLED` (src/config/env.js) is frozen at module-import
  // time from `process.env.SMS_ENABLED`, which is unset in this test run —
  // so it defaults `true` for every test in this file. Toggling it off would
  // require importing this module fresh in a dedicated file/process, which
  // isn't worth the ceremony just to cover that one boolean gate.

  it('truncates a message longer than 621 chars and appends an ellipsis', async () => {
    const longMessage = 'Encore: ' + 'x'.repeat(700);
    let sentBody;
    global.fetch = jest.fn(async (_url, options) => {
      sentBody = options.body;
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: 'success', data: 'Sent' }),
      };
    });

    await sendSms('94771234567', longMessage);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const sentMessage = sentBody.get('message');
    expect(sentMessage.length).toBe(621);
    expect(sentMessage.endsWith('…')).toBe(true);
    expect(sentMessage.startsWith('Encore: ')).toBe(true);
  });

  it('sends a message under the limit unmodified and leads with the "Encore" brand name', async () => {
    const message = 'Encore: Booking ENC-4471 confirmed. Total Rs 13,000.00.';
    let sentBody;
    global.fetch = jest.fn(async (_url, options) => {
      sentBody = options.body;
      return { ok: true, status: 200, json: async () => ({ status: 'success', data: 'Sent' }) };
    });

    await sendSms('94771234567', message);

    expect(sentBody.get('message')).toBe(message);
    expect(sentBody.get('message').startsWith('Encore')).toBe(true);
    expect(sentBody.get('to')).toBe('94771234567');
    expect(sentBody.get('sender_id')).toBeTruthy();
  });

  it('resolves (never throws) when notify.lk returns a non-success status body', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 'error', data: 'Insufficient balance' }),
    }));

    await expect(sendSms('94771234567', 'Encore: test message')).resolves.toBeDefined();
  });

  it('resolves (never throws) when notify.lk returns a non-2xx HTTP status', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ status: 'error' }),
    }));

    await expect(sendSms('94771234567', 'Encore: test message')).resolves.toBeDefined();
  });

  it('resolves (never throws) when fetch itself rejects (network failure)', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('network down');
    });

    await expect(sendSms('94771234567', 'Encore: test message')).resolves.toBeUndefined();
  });

  it('resolves (never throws) when the response body is not valid JSON', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    }));

    await expect(sendSms('94771234567', 'Encore: test message')).resolves.toBeNull();
  });
});
