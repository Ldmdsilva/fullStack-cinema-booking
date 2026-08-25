import { describe, expect, it } from 'vitest'
import { parseApiError } from './errors'
import type { ApiError } from '../types'

function axiosErrorLike(overrides: { response?: { status?: number; data?: unknown } }) {
  return { isAxiosError: true, message: 'Request failed', ...overrides }
}

describe('parseApiError', () => {
  it('passes an already-parsed ApiError straight through', () => {
    const already: ApiError = { code: 'SEAT_UNAVAILABLE', message: 'taken' }
    expect(parseApiError(already)).toBe(already)
  })

  it('maps a network failure (no response) to NETWORK_ERROR', () => {
    const result = parseApiError(axiosErrorLike({ response: undefined }))
    expect(result.code).toBe('NETWORK_ERROR')
    expect(result.message).toMatch(/could not reach the server/i)
  })

  it('prefers the server message when the body includes one', () => {
    const result = parseApiError(
      axiosErrorLike({
        response: { status: 400, data: { error: { code: 'VALIDATION_ERROR', message: 'Name is required.' } } },
      }),
    )
    expect(result).toEqual({ code: 'VALIDATION_ERROR', message: 'Name is required.', status: 400, details: undefined })
  })

  it('populates `status` from the axios response status', () => {
    const result = parseApiError(
      axiosErrorLike({ response: { status: 401, data: { error: { code: 'UNAUTHORIZED', message: 'nope' } } } }),
    )
    expect(result.status).toBe(401)
  })

  it('populates `status` as 400 for a TOKEN_EXPIRED/INVALID_TOKEN response, not 401', () => {
    // This is the crux of the client.ts bug fix: these codes are shared
    // between the 401 "your session is dead" case and the 400 "this
    // verify/reset link is stale" case — only `status` disambiguates them.
    const result = parseApiError(
      axiosErrorLike({ response: { status: 400, data: { error: { code: 'TOKEN_EXPIRED', message: 'expired link' } } } }),
    )
    expect(result.status).toBe(400)
    expect(result.code).toBe('TOKEN_EXPIRED')
  })

  it('falls back to the known message for a code when the server omits one', () => {
    const result = parseApiError(axiosErrorLike({ response: { data: { error: { code: 'DUPLICATE_EMAIL' } } } }))
    expect(result.message).toMatch(/already exists/i)
  })

  it('falls back to a generic message for an unrecognised or missing code', () => {
    const result = parseApiError(axiosErrorLike({ response: { data: {} } }))
    expect(result.code).toBe('INTERNAL_SERVER_ERROR')
    expect(result.message).toMatch(/something went wrong/i)
  })

  it('carries through structured details, e.g. a seat conflict list', () => {
    const result = parseApiError(
      axiosErrorLike({
        response: { data: { error: { code: 'SEAT_UNAVAILABLE', message: 'Taken', details: { seatIds: ['A-1'] } } } },
      }),
    )
    expect(result.details).toEqual({ seatIds: ['A-1'] })
  })

  it('wraps a plain Error as an internal error using its message', () => {
    const result = parseApiError(new Error('boom'))
    expect(result).toEqual({ code: 'INTERNAL_SERVER_ERROR', message: 'boom' })
  })

  it('falls back to a generic message for a completely unknown throw', () => {
    const result = parseApiError('nope')
    expect(result).toEqual({ code: 'INTERNAL_SERVER_ERROR', message: 'Something went wrong. Please try again.' })
  })
})
