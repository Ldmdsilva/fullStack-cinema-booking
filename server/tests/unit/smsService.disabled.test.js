import { describe, it, expect, beforeAll, jest } from '@jest/globals';

// `env.SMS_ENABLED` (src/config/env.js) is frozen at module-import time from
// `process.env.SMS_ENABLED`. Setting the env var here and only THEN
// dynamically importing smsService.js (in its own test file, so nothing has
// cached it yet) lets us exercise the "disabled" branch without disturbing
// the default-enabled assertions in smsService.test.js.
process.env.SMS_ENABLED = 'false';

let sendSms;

describe('notification/smsService.js — SMS_ENABLED=false gate', () => {
  beforeAll(async () => {
    ({ sendSms } = await import('../../src/services/notification/smsService.js'));
  });

  it('does nothing and never calls fetch when SMS is disabled', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock;

    const result = await sendSms('94771234567', 'Encore: test message');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });
});
