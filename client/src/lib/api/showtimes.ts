import { apiClient, getWithRetry } from './client'
import type { CreateShowtimePayload, Paginated, ShowtimeDetailResponse, ShowtimeSummary } from '../types'

export interface ListShowtimesParams {
  page?: number
  limit?: number
  filmId?: string
  cinemaId?: string
  from?: string
  to?: string
}

export async function list(params: ListShowtimesParams = {}): Promise<Paginated<ShowtimeSummary>> {
  return getWithRetry('/showtimes', { params })
}

// GET /showtimes/:id's actual response shape is `{showtime, seats}` as two
// sibling top-level keys (showtimeController.getShowtime) — see
// ShowtimeDetailResponse in types.ts. Do not merge these into one object.
export async function getById(id: string): Promise<ShowtimeDetailResponse> {
  return getWithRetry(`/showtimes/${id}`)
}

export async function create(payload: CreateShowtimePayload): Promise<{ showtime: ShowtimeSummary }> {
  const { data } = await apiClient.post('/showtimes', payload)
  return data
}

export async function cancel(id: string): Promise<{ showtime: ShowtimeSummary }> {
  const { data } = await apiClient.patch(`/showtimes/${id}/cancel`)
  return data
}
