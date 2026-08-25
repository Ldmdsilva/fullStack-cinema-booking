import { describe, expect, it } from 'vitest'
import * as holdsApi from './holds'
import { createHoldPaymentIntentResponseA, createHoldResponseA, holdA } from '@/test/fixtures'

describe('holds api', () => {
  it('creates a hold and returns {holdId, expiresAt, amountMinor, currency} — not a full Hold object', async () => {
    const result = await holdsApi.create({ showtimeId: 'showtime-1', seatIds: ['A-1', 'A-2'] })
    expect(result).toEqual(createHoldResponseA)
    expect(result).not.toHaveProperty('seatSnapshot')
  })

  it('fetches a hold by id using the holdId/showtimeId field names', async () => {
    const hold = await holdsApi.getById(holdA.holdId)
    expect(hold.holdId).toBe(holdA.holdId)
    expect(hold.showtimeId).toBe(holdA.showtimeId)
  })

  it('rejects with HOLD_NOT_FOUND for an unknown id', async () => {
    await expect(holdsApi.getById('nope')).rejects.toMatchObject({ code: 'HOLD_NOT_FOUND' })
  })

  it('creates a payment intent for a hold', async () => {
    const result = await holdsApi.createPaymentIntent(holdA.holdId)
    expect(result).toEqual(createHoldPaymentIntentResponseA)
  })

  it('releases a hold, resolving with no body (204)', async () => {
    await expect(holdsApi.release(holdA.holdId)).resolves.toBeUndefined()
  })
})
