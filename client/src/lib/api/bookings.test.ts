import { describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import * as bookingsApi from './bookings'
import { apiClient, getWithRetry } from './client'
import { bookingCancelled, bookingConfirmed } from '@/test/fixtures'

vi.mock('./client', async () => {
  const actual = await vi.importActual<typeof import('./client')>('./client')
  return {
    ...actual,
    getWithRetry: vi.fn(actual.getWithRetry),
  }
})

describe('bookings api', () => {
  it('lists the current user’s bookings', async () => {
    const result = await bookingsApi.listMine({ page: 1, limit: 10 })
    expect(result.items.map((b) => b.id)).toContain(bookingConfirmed.id)
    expect(result.limit).toBe(10)
  })

  it('lists all bookings (admin)', async () => {
    const result = await bookingsApi.listAll({ page: 1, limit: 10 })
    expect(result.items.length).toBeGreaterThan(0)
  })

  it('fetches a booking by id', async () => {
    const { booking } = await bookingsApi.getById(bookingConfirmed.id)
    expect(booking.reference).toBe(bookingConfirmed.reference)
  })

  it('rejects with BOOKING_NOT_FOUND for an unknown id', async () => {
    await expect(bookingsApi.getById('nope')).rejects.toMatchObject({ code: 'BOOKING_NOT_FOUND' })
  })

  it('cancels a booking', async () => {
    const { booking } = await bookingsApi.cancel(bookingCancelled.id)
    expect(booking.status).toBe('cancelled')
  })

  it('confirms a booking from a hold via POST /bookings/confirm', async () => {
    const { booking } = await bookingsApi.confirm({ holdId: 'hold-1' })
    expect(booking.id).toBe(bookingConfirmed.id)
  })

  describe('getByHold', () => {
    it('fetches the booking fulfilled from a hold via GET /bookings/by-hold/:holdId', async () => {
      const { booking } = await bookingsApi.getByHold('hold-1')
      expect(booking.id).toBe(bookingConfirmed.id)
    })

    it('rejects with BOOKING_NOT_FOUND while the booking is still reconciling', async () => {
      await expect(bookingsApi.getByHold('hold-reconciling')).rejects.toMatchObject({ code: 'BOOKING_NOT_FOUND' })
    })

    it('uses a PLAIN apiClient.get, NOT getWithRetry — a 404 here means still reconciling, and retrying would triple every poll', async () => {
      const getSpy = vi.spyOn(apiClient, 'get')
      const getWithRetrySpy = vi.mocked(getWithRetry)
      getWithRetrySpy.mockClear()

      await bookingsApi.getByHold('hold-1')

      expect(getSpy).toHaveBeenCalledWith('/bookings/by-hold/hold-1')
      expect(getWithRetrySpy).not.toHaveBeenCalled()

      getSpy.mockRestore()
    })

    it('does not retry on a 404 (no getWithRetry backoff behaviour)', async () => {
      let attempts = 0
      server.use(
        http.get('/api/bookings/by-hold/:holdId', () => {
          attempts += 1
          return HttpResponse.json({ error: { code: 'BOOKING_NOT_FOUND', message: 'not yet' } }, { status: 404 })
        }),
      )

      await expect(bookingsApi.getByHold('hold-1')).rejects.toMatchObject({ code: 'BOOKING_NOT_FOUND' })
      expect(attempts).toBe(1)
    })
  })
})
