import { afterEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { apiClient, getWithRetry } from './client'
import { getToken, setToken } from '../tokenStore'

describe('getWithRetry', () => {
  it('retries a failing GET with backoff and resolves once the server recovers', async () => {
    let attempts = 0
    server.use(
      http.get('/api/health', () => {
        attempts += 1
        if (attempts < 3) return new HttpResponse(null, { status: 500 })
        return HttpResponse.json({ status: 'healthy', db: 'connected', uptime: 1, timestamp: 'now' })
      }),
    )

    const result = await getWithRetry<{ status: string }>('/health')
    expect(result.status).toBe('healthy')
    expect(attempts).toBe(3)
  })

  it('gives up after 3 attempts and throws', async () => {
    let attempts = 0
    server.use(
      http.get('/api/health', () => {
        attempts += 1
        return new HttpResponse(null, { status: 500 })
      }),
    )

    await expect(getWithRetry('/health')).rejects.toBeTruthy()
    expect(attempts).toBe(3)
  })
})

describe('apiClient response interceptor', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    window.history.pushState({}, '', '/')
  })

  it('clears the token on a 401', async () => {
    // jsdom's `window.location.assign` is a non-configurable own property,
    // so it can't be spied on directly — staying on /login sidesteps the
    // interceptor's `window.location.assign('/login')` call (it's a no-op
    // there) while still exercising the token-clearing behaviour, which is
    // the part under test here.
    window.history.pushState({}, '', '/login')
    setToken('some-token')
    server.use(http.get('/api/health', () => HttpResponse.json({ error: { code: 'UNAUTHORIZED', message: 'nope' } }, { status: 401 })))

    await expect(apiClient.get('/health')).rejects.toMatchObject({ code: 'UNAUTHORIZED' })

    expect(getToken()).toBeNull()
  })

  it('clears the token on a 401 regardless of which code the server used', async () => {
    // The logout trigger is keyed on HTTP status, not `code` — a 401 from
    // TOKEN_REVOKED (or any other code) must log the user out just the same
    // as a plain UNAUTHORIZED.
    window.history.pushState({}, '', '/login')
    setToken('some-token')
    server.use(http.get('/api/health', () => HttpResponse.json({ error: { code: 'TOKEN_REVOKED', message: 'nope' } }, { status: 401 })))

    await expect(apiClient.get('/health')).rejects.toMatchObject({ code: 'TOKEN_REVOKED' })

    expect(getToken()).toBeNull()
  })

  it('does NOT clear the token on a 400 TOKEN_EXPIRED/INVALID_TOKEN response (expired verify/reset link)', async () => {
    // Regression test for the code/status collision bug: TOKEN_EXPIRED and
    // INVALID_TOKEN are also the exact codes the server returns for an
    // expired or garbage email-verification/password-reset link, which come
    // back as 400, not 401. A user clicking such a link while they have an
    // active session must NOT be logged out by this interceptor.
    window.history.pushState({}, '', '/verify-email')
    setToken('an-active-session-token')
    server.use(
      http.post('/api/auth/verify-email', () =>
        HttpResponse.json({ error: { code: 'TOKEN_EXPIRED', message: 'This link has expired.' } }, { status: 400 }),
      ),
    )

    await expect(apiClient.post('/auth/verify-email', { token: 'stale' })).rejects.toMatchObject({
      code: 'TOKEN_EXPIRED',
      status: 400,
    })

    expect(getToken()).toBe('an-active-session-token')

    setToken(null)
    server.use(
      http.post('/api/auth/reset-password', () =>
        HttpResponse.json({ error: { code: 'INVALID_TOKEN', message: 'This link is invalid.' } }, { status: 400 }),
      ),
    )
    setToken('another-active-session-token')

    await expect(apiClient.post('/auth/reset-password', { token: 'bad', password: 'x' })).rejects.toMatchObject({
      code: 'INVALID_TOKEN',
      status: 400,
    })

    expect(getToken()).toBe('another-active-session-token')
  })

  it('normalises every rejection into an ApiError shape', async () => {
    server.use(http.get('/api/health', () => HttpResponse.json({ error: { code: 'INTERNAL_SERVER_ERROR', message: 'oops' } }, { status: 500 })))
    await expect(apiClient.get('/health')).rejects.toEqual({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'oops',
      status: 500,
      details: undefined,
    })
  })
})
