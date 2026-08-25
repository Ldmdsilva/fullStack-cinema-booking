import type { Locator, Page } from '@playwright/test';

/**
 * Seat buttons (client/src/components/seats/Seat.tsx) carry no `data-*`
 * hooks — their accessible name is the only stable identifier:
 *   held:      "Seat B-3, row B, Rs 1,234, on hold by another customer"
 *   otherwise: "Seat B-3, row B, Rs 1,234, <available|selected|unavailable>"
 * These helpers match against that real aria-label rather than inventing
 * test ids the component doesn't have.
 */

export function seatButton(page: Page, seatId: string): Locator {
  return page.getByRole('button', { name: new RegExp(`^Seat ${escapeRegExp(seatId)}, `) });
}

export function firstAvailableSeat(page: Page): Locator {
  return page.getByRole('button', { name: /, available$/ }).first();
}

export async function seatIdFromLocator(seat: Locator): Promise<string> {
  const label = await seat.getAttribute('aria-label');
  const match = label?.match(/^Seat (\S+),/);
  if (!match) throw new Error(`Could not parse seat id from aria-label: ${label}`);
  return match[1];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
