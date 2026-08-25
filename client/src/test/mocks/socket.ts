// A deterministic test double for the app's single Socket.IO connection
// (see src/lib/socket.ts). SocketContext only ever calls a small, fixed
// subset of the real socket.io-client API — on/off, emit, connect/
// disconnect, the `connected` flag, `auth`, and the nested `io.on`/`io.off`
// used for the manager-level "reconnect" event — so this fake implements
// exactly that surface instead of pulling in real transports.
//
// Tests reach the instance SocketProvider created via `getLastFakeSocket()`
// and drive it with `.trigger(event, payload)` (client-facing events like
// `connect`, `disconnect`, `seats:updated`) or `.triggerReconnect()` (the
// manager-level `reconnect` event that bumps SocketContext's reconnectCount).
import type { AppSocket } from '@/lib/socket'

type Listener = (...args: unknown[]) => void

export class FakeSocket {
  connected = false
  auth: { token: string | null } = { token: null }

  private listeners = new Map<string, Set<Listener>>()
  private ioListeners = new Map<string, Set<Listener>>()
  readonly emitted: { event: string; args: unknown[] }[] = []

  io = {
    on: (event: string, handler: Listener) => {
      if (!this.ioListeners.has(event)) this.ioListeners.set(event, new Set())
      this.ioListeners.get(event)!.add(handler)
      return this.io
    },
    off: (event: string, handler: Listener) => {
      this.ioListeners.get(event)?.delete(handler)
      return this.io
    },
  }

  on(event: string, handler: Listener): this {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(handler)
    return this
  }

  off(event: string, handler: Listener): this {
    this.listeners.get(event)?.delete(handler)
    return this
  }

  emit(event: string, ...args: unknown[]): boolean {
    this.emitted.push({ event, args })
    return true
  }

  connect(): this {
    // Deferred to a microtask, like the real handshake: SocketContext calls
    // `socket.connect()` and only registers its `on('connect', ...)`
    // listener on the next line — firing synchronously here would dispatch
    // to zero listeners.
    queueMicrotask(() => {
      this.connected = true
      this.trigger('connect')
    })
    return this
  }

  disconnect(): this {
    this.connected = false
    this.trigger('disconnect')
    return this
  }

  /** Fire a client-facing event (e.g. `connect`, `disconnect`, `seats:updated`). */
  trigger(event: string, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach((handler) => handler(...args))
  }

  /** Fire the manager-level `reconnect` event SocketContext listens for via `socket.io.on`. */
  triggerReconnect(): void {
    this.ioListeners.get('reconnect')?.forEach((handler) => handler())
  }
}

let instances: FakeSocket[] = []

export function createSocket(token: string | null): AppSocket {
  const socket = new FakeSocket()
  socket.auth = { token }
  instances.push(socket)
  return socket as unknown as AppSocket
}

/** The most recently created fake socket — SocketProvider creates exactly one per mount. */
export function getLastFakeSocket(): FakeSocket {
  const socket = instances[instances.length - 1]
  if (!socket) throw new Error('No fake socket has been created yet — render a SocketProvider first.')
  return socket
}

export function resetFakeSockets(): void {
  instances = []
}
