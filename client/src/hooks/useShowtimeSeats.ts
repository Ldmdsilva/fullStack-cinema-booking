import * as React from 'react'
import * as showtimesApi from '@/lib/api/showtimes'
import { useSocket } from '@/context/SocketContext'
import { useToast } from '@/components/ui/toast'
import { parseApiError } from '@/lib/api/errors'
import type {
  ApiError,
  ShowtimeCancelledPayload,
  ShowtimeSeat,
  ShowtimeSummary,
  SeatStatus,
  SeatsUpdatedPayload,
} from '@/lib/types'

export const MAX_SEATS = 8

interface ShowtimeSeatsState {
  showtime: ShowtimeSummary | null
  seats: ShowtimeSeat[]
  selectedIds: string[]
  status: 'loading' | 'error' | 'ready'
  error: ApiError | null
  cancelled: boolean
}

type Action =
  | { type: 'LOADED'; showtime: ShowtimeSummary; seats: ShowtimeSeat[] }
  | { type: 'LOAD_FAILED'; error: ApiError }
  | { type: 'TOGGLE_SELECT'; seatId: string }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'REMOTE_UPDATE'; seatIds: string[]; status: SeatStatus }
  | { type: 'RESYNC'; showtime: ShowtimeSummary; seats: ShowtimeSeat[] }
  | { type: 'CANCELLED' }

const initialState: ShowtimeSeatsState = {
  showtime: null,
  seats: [],
  selectedIds: [],
  status: 'loading',
  error: null,
  cancelled: false,
}

function reducer(state: ShowtimeSeatsState, action: Action): ShowtimeSeatsState {
  switch (action.type) {
    case 'LOADED':
      return {
        ...state,
        showtime: action.showtime,
        seats: action.seats,
        status: 'ready',
        error: null,
        cancelled: action.showtime.status === 'cancelled',
      }
    case 'RESYNC': {
      // Never trust cached selection across a reconnect gap — drop any
      // selected seat that is no longer available server-side (FR-16, R7).
      const availableIds = new Set(action.seats.filter((s) => s.status === 'available').map((s) => s.id))
      return {
        ...state,
        showtime: action.showtime,
        seats: action.seats,
        status: 'ready',
        error: null,
        cancelled: action.showtime.status === 'cancelled',
        selectedIds: state.selectedIds.filter((id) => availableIds.has(id)),
      }
    }
    case 'LOAD_FAILED':
      return { ...state, status: 'error', error: action.error }
    case 'TOGGLE_SELECT': {
      const seat = state.seats.find((s) => s.id === action.seatId)
      if (!seat || seat.status !== 'available') return state
      const isSelected = state.selectedIds.includes(action.seatId)
      if (isSelected) {
        return { ...state, selectedIds: state.selectedIds.filter((id) => id !== action.seatId) }
      }
      if (state.selectedIds.length >= MAX_SEATS) return state
      return { ...state, selectedIds: [...state.selectedIds, action.seatId] }
    }
    case 'CLEAR_SELECTION':
      return { ...state, selectedIds: [] }
    case 'REMOTE_UPDATE': {
      const affected = new Set(action.seatIds)
      const seats = state.seats.map((seat) => (affected.has(seat.id) ? { ...seat, status: action.status } : seat))
      const selectedIds =
        action.status === 'available' ? state.selectedIds : state.selectedIds.filter((id) => !affected.has(id))
      return { ...state, seats, selectedIds }
    }
    case 'CANCELLED':
      return { ...state, cancelled: true, selectedIds: [] }
    default:
      return state
  }
}

/**
 * Owns one showtime's seat state end to end: initial fetch, the customer's
 * in-progress selection, and remote seat updates over the shared socket
 * (FR-13/14/15/16). Selection is capped at MAX_SEATS and only ever contains
 * seats the server currently reports as `available`.
 */
export function useShowtimeSeats(showtimeId: string | undefined) {
  const [state, dispatch] = React.useReducer(reducer, initialState)
  const { socket, isConnected, reconnectCount, joinShowtime, leaveShowtime } = useSocket()
  const { toast } = useToast()
  const selectedIdsRef = React.useRef<string[]>([])
  selectedIdsRef.current = state.selectedIds

  const load = React.useCallback(async (kind: 'LOADED' | 'RESYNC') => {
    if (!showtimeId) return
    try {
      const { showtime, seats } = await showtimesApi.getById(showtimeId)
      dispatch({ type: kind, showtime, seats })
    } catch (err) {
      dispatch({ type: 'LOAD_FAILED', error: parseApiError(err) })
    }
  }, [showtimeId])

  React.useEffect(() => {
    if (!showtimeId) return
    load('LOADED')
    joinShowtime(showtimeId)
    return () => leaveShowtime(showtimeId)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the showtime id itself changes
  }, [showtimeId])

  const skipNextResync = React.useRef(true)
  React.useEffect(() => {
    if (skipNextResync.current) {
      skipNextResync.current = false
      return
    }
    load('RESYNC')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires only on reconnectCount changes
  }, [reconnectCount])

  React.useEffect(() => {
    if (!showtimeId) return

    function handleSeatsUpdated(payload: SeatsUpdatedPayload) {
      if (payload.showtimeId !== showtimeId) return

      if (payload.status !== 'available') {
        const dropped = payload.seatIds.filter((id) => selectedIdsRef.current.includes(id))
        if (dropped.length > 0) {
          toast(
            dropped.length === 1
              ? `Seat ${dropped[0]} was just taken by another customer.`
              : `Seats ${dropped.join(', ')} were just taken by another customer.`,
            'error',
          )
        }
      }

      dispatch({ type: 'REMOTE_UPDATE', seatIds: payload.seatIds, status: payload.status })
    }

    function handleShowtimeCancelled(payload: ShowtimeCancelledPayload) {
      if (payload.showtimeId !== showtimeId) return
      dispatch({ type: 'CANCELLED' })
      toast('This showtime has been cancelled.', 'error')
    }

    socket.on('seats:updated', handleSeatsUpdated)
    socket.on('showtime:cancelled', handleShowtimeCancelled)
    return () => {
      socket.off('seats:updated', handleSeatsUpdated)
      socket.off('showtime:cancelled', handleShowtimeCancelled)
    }
  }, [socket, showtimeId, toast])

  const toggleSeat = React.useCallback((seatId: string) => {
    dispatch({ type: 'TOGGLE_SELECT', seatId })
  }, [])

  const clearSelection = React.useCallback(() => {
    dispatch({ type: 'CLEAR_SELECTION' })
  }, [])

  const retry = React.useCallback(() => load('LOADED'), [load])
  const resync = React.useCallback(() => load('RESYNC'), [load])

  return {
    showtime: state.showtime,
    seats: state.seats,
    selectedIds: state.selectedIds,
    status: state.status,
    error: state.error,
    cancelled: state.cancelled,
    isConnected,
    toggleSeat,
    clearSelection,
    retry,
    resync,
  }
}
