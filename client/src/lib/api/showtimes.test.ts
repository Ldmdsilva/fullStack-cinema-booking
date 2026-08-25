import { describe, expect, it } from 'vitest'
import * as showtimesApi from './showtimes'
import { showtimeSummaryA } from '@/test/fixtures'

describe('showtimes api', () => {
  it('lists showtimes with pagination metadata', async () => {
    const result = await showtimesApi.list({ page: 1, limit: 10 })
    expect(result.items.length).toBeGreaterThan(0)
  })

  it('fetches a showtime detail as {showtime, seats} sibling keys, not merged', async () => {
    const result = await showtimesApi.getById(showtimeSummaryA.id)
    expect(result.showtime.id).toBe(showtimeSummaryA.id)
    expect(Array.isArray(result.seats)).toBe(true)
    expect(result.seats.length).toBeGreaterThan(0)
    // A merged shape would put `seats` on the showtime object itself.
    expect(result.showtime).not.toHaveProperty('seats')
  })

  it('rejects with SHOWTIME_NOT_FOUND for an unknown id', async () => {
    await expect(showtimesApi.getById('nope')).rejects.toMatchObject({ code: 'SHOWTIME_NOT_FOUND' })
  })

  it('creates a showtime', async () => {
    const { showtime } = await showtimesApi.create({
      filmRef: 'film-1',
      cinemaRef: 'cinema-1',
      screenId: 'screen-1',
      startsAt: '2026-12-01T20:00:00.000Z',
      basePrice: 1500,
    })
    expect(showtime).toBeTruthy()
  })

  it('cancels a showtime', async () => {
    const { showtime } = await showtimesApi.cancel(showtimeSummaryA.id)
    expect(showtime.status).toBe('cancelled')
  })
})
