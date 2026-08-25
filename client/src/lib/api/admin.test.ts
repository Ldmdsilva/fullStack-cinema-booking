import { describe, expect, it } from 'vitest'
import * as adminApi from './admin'

describe('admin api', () => {
  it('fetches dashboard stats', async () => {
    const stats = await adminApi.stats()
    expect(stats.totalShowtimes).toBeGreaterThan(0)
    expect(typeof stats.occupancyRate).toBe('number')
  })

  it('lists showtimes with pagination metadata (renamed from the old listEvents/GET /admin/events)', async () => {
    const result = await adminApi.listShowtimes({ page: 1, limit: 10 })
    expect(result.items.length).toBeGreaterThan(0)
    expect(result.items[0]).toHaveProperty('revenue')
    expect(result.items[0]).toHaveProperty('bookingCount')
    expect(result).toHaveProperty('total')
    expect(result).toHaveProperty('totalPages')
  })
})
