import { io, type Socket } from 'socket.io-client'
import type { ClientToServerEvents, ServerToClientEvents } from './types'

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>

/**
 * Create the app's single Socket.IO connection. The JWT is passed as
 * `auth.token` on the handshake — the server already reads
 * `socket.handshake.auth.token` (ADR-005).
 */
export function createSocket(token: string | null): AppSocket {
  return io(import.meta.env.VITE_SOCKET_URL || undefined, {
    autoConnect: false,
    auth: { token },
  })
}
