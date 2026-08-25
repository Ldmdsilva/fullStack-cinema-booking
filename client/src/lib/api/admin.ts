import { getWithRetry } from './client'
import type { AdminShowtime, AdminStats, Paginated } from '../types'

export interface ListAdminShowtimesParams {
  page?: number
  limit?: number
}

export async function stats(): Promise<AdminStats> {
  return getWithRetry('/admin/stats')
}

// Renamed from the old listEvents/GET /admin/events (server/src/routes/adminRoutes.js).
export async function listShowtimes(params: ListAdminShowtimesParams = {}): Promise<Paginated<AdminShowtime>> {
  return getWithRetry('/admin/showtimes', { params })
}
