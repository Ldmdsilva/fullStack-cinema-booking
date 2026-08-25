import { apiClient, getWithRetry } from './client'
import type { CreateFilmPayload, Film, Paginated, UpdateFilmPayload } from '../types'

export interface ListFilmsParams {
  page?: number
  limit?: number
  genre?: string
  search?: string
}

export async function list(params: ListFilmsParams = {}): Promise<Paginated<Film>> {
  return getWithRetry('/films', { params })
}

export async function getById(id: string): Promise<Film> {
  const { film } = await getWithRetry<{ film: Film }>(`/films/${id}`)
  return film
}

export async function create(payload: CreateFilmPayload): Promise<Film> {
  const { data } = await apiClient.post<{ film: Film }>('/films', payload)
  return data.film
}

// The server registers this route as PUT, not PATCH (server/src/routes/filmRoutes.js).
export async function update(id: string, payload: UpdateFilmPayload): Promise<Film> {
  const { data } = await apiClient.put<{ film: Film }>(`/films/${id}`, payload)
  return data.film
}

export async function remove(id: string): Promise<void> {
  await apiClient.delete(`/films/${id}`)
}
