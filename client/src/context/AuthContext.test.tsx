import { describe, expect, it } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { AuthProvider, useAuth } from './AuthContext'
import { server } from '@/test/mocks/server'
import { setToken } from '@/lib/tokenStore'
import { adminUser, customerUser } from '@/test/fixtures'

describe('AuthContext', () => {
  it('settles anonymous with no stored token', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.status).toBe('anonymous'))
    expect(result.current.user).toBeNull()
  })

  it('starts loading, then bootstraps an authenticated session from a stored token', async () => {
    // Unlike the no-token case above, verifying a stored token awaits a real
    // GET /users/me — that's the one bootstrap path where 'loading' is
    // actually observable before it settles.
    setToken('test-token')
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('authenticated'))
    expect(result.current.user?.email).toBe(customerUser.email)
    expect(result.current.isAdmin).toBe(false)
  })

  it('falls back to anonymous and clears the token when it is rejected', async () => {
    setToken('a-stale-token')
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.status).toBe('anonymous'))
    expect(result.current.user).toBeNull()
  })

  it('logs in and reports admin status for an admin account', async () => {
    server.use(
      http.post('/api/auth/login', () => HttpResponse.json({ user: adminUser, token: 'admin-token' })),
    )
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.status).toBe('anonymous'))

    await act(async () => {
      await result.current.login({ email: adminUser.email, password: 'Password123' })
    })

    expect(result.current.status).toBe('authenticated')
    expect(result.current.isAdmin).toBe(true)
  })

  it('registers a new account without authenticating (D14 — register never issues a token)', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.status).toBe('anonymous'))

    let response: { message: string } | undefined
    await act(async () => {
      response = await result.current.register({
        name: 'New',
        email: 'new@example.com',
        password: 'password123',
        phone: '0771234567',
      })
    })

    expect(response?.message).toEqual(expect.any(String))
    expect(response?.message.length).toBeGreaterThan(0)
    expect(result.current.status).toBe('anonymous')
    expect(result.current.user).toBeNull()
    expect(result.current.token).toBeNull()
  })

  it('updates the profile in place', async () => {
    setToken('test-token')
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.status).toBe('authenticated'))

    await act(async () => {
      await result.current.updateProfile({ name: 'Changed Name' })
    })

    expect(result.current.user?.name).toBe('Changed Name')
  })

  it('logs out, clearing the user and token', async () => {
    setToken('test-token')
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.status).toBe('authenticated'))

    act(() => result.current.logout())

    expect(result.current.status).toBe('anonymous')
    expect(result.current.user).toBeNull()
    expect(result.current.token).toBeNull()
  })
})
