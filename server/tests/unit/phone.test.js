import { describe, it, expect } from '@jest/globals';
import { normaliseLk } from '../../src/utils/phone.js';

describe('utils/phone.js — normaliseLk (FR-1, notify.lk)', () => {
  it.each([
    ['0771234567', '94771234567'],
    ['+94771234567', '94771234567'],
    ['94771234567', '94771234567'],
    ['94 77 123 4567', '94771234567'],
    ['077-123-4567', '94771234567'],
    ['(077) 123 4567', '94771234567'],
    ['0711234567', '94711234567'],
    ['771234567', '94771234567'], // bare 9-digit mobile, no leading 0
  ])('normalises %s to %s', (input, expected) => {
    expect(normaliseLk(input)).toBe(expected);
  });

  it.each([
    ['07 7123', null], // too short
    ['12345', null], // garbage / too short
    ['0071234567', null], // 10 digits after stripping non-digits, doesn't start with 0 or 94 validly (0071234567 starts with 00)
    ['9401234567', null], // 10 digits total — doesn't fit the 94+11 or 0+10 or bare-9 shapes
    ['abcdefghij', null], // no digits at all
    ['', null], // empty string
    [null, null], // non-string input
    [undefined, null], // non-string input
    [1234567890, null], // non-string input (number)
    ['0123456789012345', null], // way too long
  ])('returns null for invalid input %s', (input, expected) => {
    expect(normaliseLk(input)).toBe(expected);
  });
});
