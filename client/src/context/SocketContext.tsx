import * as React from 'react'
import { createSocket, type AppSocket } from '@/lib/socket'
import { useAuth } from './AuthContext'

interface SocketContextValue {
  socket: AppSocket
  isConnected: boolean
  /** Bumps on every reconnect — consumers should re-fetch authoritative
   * state rather than trust whatever they cached across the gap (FR-16, R7). */
  reconnectCount: number
  joinShowtime: (showtimeId: string) => void
  leaveShowtime: (showtimeId: string) => void
}

const SocketContext = React.createContext<SocketContextValue | null>(null)

export function useSocket() {
  const ctx = React.useContext(SocketContext)
  if (!ctx) throw new Error('useSocket must be used within SocketProvider')
  return ctx
}

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { token, status } = useAuth()
  const socketRef = React.useRef<AppSocket | null>(null)
  if (!socketRef.current) {
    socketRef.current = createSocket(token)
  }
  const socket = socketRef.current

  const [isConnected, setIsConnected] = React.useState(false)
  const [reconnectCount, setReconnectCount] = React.useState(0)

  // One connection for the app's lifetime. Reconnect (carrying the fresh
  // token) whenever auth status settles or the token changes, so an
  // authenticated socket always joins its own `user:<id>` room.
  React.useEffect(() => {
    if (status === 'loading') return

    socket.auth = { token }
    if (socket.connected) socket.disconnect()
    socket.connect()

    const handleConnect = () => setIsConnected(true)
    const handleDisconnect = () => setIsConnected(false)
    const handleReconnect = () => setReconnectCount((count) => count + 1)

    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)
    socket.io.on('reconnect', handleReconnect)

    return () => {
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
      socket.io.off('reconnect', handleReconnect)
    }
  }, [socket, token, status])

  React.useEffect(() => {
    return () => {
      socket.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- disconnect only on final unmount
  }, [])

  const joinShowtime = React.useCallback(
    (showtimeId: string) => socket.emit('join:showtime', { showtimeId }),
    [socket],
  )
  const leaveShowtime = React.useCallback(
    (showtimeId: string) => socket.emit('leave:showtime', { showtimeId }),
    [socket],
  )

  const value: SocketContextValue = { socket, isConnected, reconnectCount, joinShowtime, leaveShowtime }

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
}
