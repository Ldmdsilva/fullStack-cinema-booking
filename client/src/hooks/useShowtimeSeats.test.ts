import { describe, expect, it } from 'vitest'
import { act, renderHook, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { useShowtimeSeats } from './useShowtimeSeats'
import { ProvidersWrapper } from '@/test/utils'
import { server } from '@/test/mocks/server'
import { getLastFakeSocket } from '@/test/mocks/socket'
import { showtimeSummaryA } from '@/test/fixtures'

const SHOWTIME_ID = showtimeSummaryA.id

describe('useShowtimeSeats', () => {
  it('loads the showtime and seats, and connects the socket', async () => {
    const { result } = renderHook(() => useShowtimeSeats(SHOWTIME_ID), { wrapper: ProvidersWrapper })

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.showtime?.id).toBe(SHOWTIME_ID)
    expect(result.current.seats.length).toBeGreaterThan(0)
    await waitFor(() => expect(result.current.isConnected).toBe(true))
  })

  it('drops a selected seat, and toasts, when it is remotely taken', async () => {
    const { result } = renderHook(() => useShowtimeSeats(SHOWTIME_ID), { wrapper: ProvidersWrapper })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    const availableSeat = result.current.seats.find((s) => s.status === 'available')
    if (!availableSeat) throw new Error('fixture must contain an available seat')

    act(() => result.current.toggleSeat(availableSeat.id))
    expect(result.current.selectedIds).toContain(availableSeat.id)

    const socket = getLastFakeSocket()
    act(() => {
      socket.trigger('seats:updated', { showtimeId: SHOWTIME_ID, seatIds: [availableSeat.id], status: 'held' })
    })

    await waitFor(() => expect(result.current.selectedIds).not.toContain(availableSeat.id))
    expect(result.current.seats.find((s) => s.id === availableSeat.id)?.status).toBe('held')
    await screen.findByText(/was just taken by another customer/i)
  })

  it('keeps a selection that is unaffected by an unrelated remote update', async () => {
    const { result } = renderHook(() => useShowtimeSeats(SHOWTIME_ID), { wrapper: ProvidersWrapper })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    const [seatOne, seatTwo] = result.current.seats.filter((s) => s.status === 'available')
    act(() => result.current.toggleSeat(seatOne.id))

    const socket = getLastFakeSocket()
    act(() => {
      socket.trigger('seats:updated', { showtimeId: SHOWTIME_ID, seatIds: [seatTwo.id], status: 'booked' })
    })

    expect(result.current.selectedIds).toEqual([seatOne.id])
  })

  it('sets cancelled and clears selection when the showtime is cancelled remotely', async () => {
    const { result } = renderHook(() => useShowtimeSeats(SHOWTIME_ID), { wrapper: ProvidersWrapper })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    const availableSeat = result.current.seats.find((s) => s.status === 'available')!
    act(() => result.current.toggleSeat(availableSeat.id))
    expect(result.current.selectedIds).toContain(availableSeat.id)

    const socket = getLastFakeSocket()
    act(() => {
      socket.trigger('showtime:cancelled', { showtimeId: SHOWTIME_ID })
    })

    await waitFor(() => expect(result.current.cancelled).toBe(true))
    expect(result.current.selectedIds).toEqual([])
    await screen.findByText(/showtime has been cancelled/i)
  })

  it('re-fetches the showtime when the socket reconnects', async () => {
    let getByIdCalls = 0
    server.use(
      http.get(`/api/showtimes/:id`, ({ params }) => {
        getByIdCalls += 1
        return HttpResponse.json({
          showtime: { ...showtimeSummaryA, id: params.id },
          seats: [],
        })
      }),
    )

    const { result } = renderHook(() => useShowtimeSeats(SHOWTIME_ID), { wrapper: ProvidersWrapper })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(getByIdCalls).toBe(1)

    const socket = getLastFakeSocket()
    act(() => socket.triggerReconnect())

    await waitFor(() => expect(getByIdCalls).toBe(2))
  })

  it('drops a selected seat that is no longer available after a reconnect resync', async () => {
    const availableId = 'A-1'
    let seatsResponse: { id: string; status: 'available' | 'held' | 'booked' }[] = [
      { id: availableId, status: 'available' },
    ]
    server.use(
      http.get(`/api/showtimes/:id`, () =>
        HttpResponse.json({
          showtime: showtimeSummaryA,
          seats: seatsResponse.map((s) => ({
            id: s.id,
            section: 'STANDARD',
            row: 'A',
            number: 1,
            tier: 'STANDARD',
            status: s.status,
            price: 1500,
          })),
        }),
      ),
    )

    const { result } = renderHook(() => useShowtimeSeats(SHOWTIME_ID), { wrapper: ProvidersWrapper })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    act(() => result.current.toggleSeat(availableId))
    expect(result.current.selectedIds).toEqual([availableId])

    // Server truth changes across the reconnect gap without an explicit
    // seats:updated event (e.g. it fired while the socket was down).
    seatsResponse = [{ id: availableId, status: 'booked' }]
    const socket = getLastFakeSocket()
    act(() => socket.triggerReconnect())

    await waitFor(() => expect(result.current.selectedIds).toEqual([]))
  })
})
