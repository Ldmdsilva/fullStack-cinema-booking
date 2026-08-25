import { describe, expect, it, vi } from 'vitest'
import { getToken, setToken, subscribeToken } from './tokenStore'

describe('tokenStore', () => {
  it('starts with no token once cleared', () => {
    setToken(null)
    expect(getToken()).toBeNull()
  })

  it('persists a token to localStorage and back out through getToken', () => {
    setToken('abc.def.ghi')
    expect(getToken()).toBe('abc.def.ghi')
    expect(localStorage.getItem('encore_token')).toBe('abc.def.ghi')
  })

  it('removes the token from localStorage when cleared', () => {
    setToken('abc.def.ghi')
    setToken(null)
    expect(getToken()).toBeNull()
    expect(localStorage.getItem('encore_token')).toBeNull()
  })

  it('notifies subscribers on every change', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToken(listener)

    setToken('token-1')
    expect(listener).toHaveBeenCalledWith('token-1')

    unsubscribe()
    setToken('token-2')
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
