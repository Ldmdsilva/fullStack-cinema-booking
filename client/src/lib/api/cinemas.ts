import { apiClient, getWithRetry } from './client'
import type { Cinema, CinemaSummary, CreateCinemaPayload, UpdateCinemaPayload } from '../types'

// GET /cinemas (cinemaController.listCinemas) returns `{items: [...]}` — a
// flat list with no pagination metadata (total/page/limit/totalPages), not
// a `Paginated<T>` envelope. Unwrap `items` here so callers just get the array.
export async function list(): Promise<CinemaSummary[]> {
  const { items } = await getWithRetry<{ items: CinemaSummary[] }>('/cinemas')
  return items
}

export async function getById(id: string): Promise<Cinema> {
  const { cinema } = await getWithRetry<{ cinema: Cinema }>(`/cinemas/${id}`)
  return cinema
}

export async function create(payload: CreateCinemaPayload): Promise<Cinema> {
  const { data } = await apiClient.post<{ cinema: Cinema }>('/cinemas', payload)
  return data.cinema
}

// The server registers this route as PATCH (server/src/routes/cinemaRoutes.js).
export async function update(id: string, payload: UpdateCinemaPayload): Promise<Cinema> {
  const { data } = await apiClient.patch<{ cinema: Cinema }>(`/cinemas/${id}`, payload)
  return data.cinema
}

export async function remove(id: string): Promise<void> {
  await apiClient.delete(`/cinemas/${id}`)
}
