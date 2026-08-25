// Exercises the real module — every other test file gets the fake from
// src/test/mocks/socket.ts via the global `vi.mock('@/lib/socket', ...)` in
// setupTests.ts, so this file opts back out to cover the real
// implementation directly.
import { describe, expect, it, vi } from 'vitest'

vi.unmock('@/lib/socket')

describe('createSocket', () => {
  it('builds a socket.io-client instance configured for a manual, authenticated connection', async () => {
    const { createSocket } = await import('./socket')
    const socket = createSocket('a-jwt')

    // autoConnect: false — the caller (SocketContext) decides when to connect.
    expect(socket.connected).toBe(false)
    expect(socket.auth).toEqual({ token: 'a-jwt' })

    socket.disconnect()
  })

  it('supports an anonymous (no-token) connection', async () => {
    const { createSocket } = await import('./socket')
    const socket = createSocket(null)
    expect(socket.auth).toEqual({ token: null })
    socket.disconnect()
  })
})
