import { describe, expect, it } from 'vitest'
import { formatEventDate, formatPrice, formatSeatLabel, formatStubDate } from './formatters'
import type { ShowtimeSeat } from './types'

describe('formatPrice', () => {
  it('formats a number as grouped LKR with two decimals', () => {
    expect(formatPrice(6500)).toBe('Rs 6,500.00')
  })

  it('handles zero and fractional amounts', () => {
    expect(formatPrice(0)).toBe('Rs 0.00')
    expect(formatPrice(1234.5)).toBe('Rs 1,234.50')
  })
})

describe('formatEventDate', () => {
  // Exact wording (weekday/month abbreviation, comma placement) is
  // ICU-version-dependent — asserted loosely by shape instead of an exact
  // string to avoid coupling to the runtime's locale data.
  it('renders a date containing the year and a 24h time', () => {
    const result = formatEventDate('2026-09-12T20:00:00.000Z')
    expect(result).toContain('2026')
    expect(result).toMatch(/\d{2}:\d{2}$/)
  })
})

describe('formatStubDate', () => {
  it('renders an uppercase eyebrow-style date with a mono-dot separator', () => {
    const result = formatStubDate('2026-09-12T20:00:00.000Z')
    expect(result).toBe(result.toUpperCase())
    expect(result.split(' · ')).toHaveLength(3)
    expect(result).toMatch(/\d{2}:\d{2}$/)
  })
})

describe('formatSeatLabel', () => {
  it('returns the seat id', () => {
    const seat: ShowtimeSeat = { id: 'B-14', section: 'STALLS', row: 'B', number: 14, tier: 'STANDARD', status: 'available', price: 6500 }
    expect(formatSeatLabel(seat)).toBe('B-14')
  })
})
