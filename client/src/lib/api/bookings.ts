import { apiClient, getWithRetry } from './client'
import type { Booking, ConfirmBookingPayload, Paginated } from '../types'

export interface ListBookingsParams {
  page?: number
  limit?: number
}

export interface ListAllBookingsParams extends ListBookingsParams {
  showtimeId?: string
}

export async function getById(id: string): Promise<{ booking: Booking }> {
  return getWithRetry(`/bookings/${id}`)
}

export async function listMine(params: ListBookingsParams = {}): Promise<Paginated<Booking>> {
  return getWithRetry('/bookings/me', { params })
}

export async function listAll(params: ListAllBookingsParams = {}): Promise<Paginated<Booking>> {
  return getWithRetry('/bookings', { params })
}

export async function cancel(id: string): Promise<{ booking: Booking }> {
  const { data } = await apiClient.patch(`/bookings/${id}/cancel`)
  return data
}

/**
 * Fulfil a Hold into a Booking after the client confirms payment with
 * Stripe. Never retried — a retried confirm could double-submit against the
 * same Hold (§C7.3).
 */
export async function confirm(payload: ConfirmBookingPayload): Promise<{ booking: Booking }> {
  const { data } = await apiClient.post('/bookings/confirm', payload)
  return data
}

/**
 * Poll for the Booking a Hold was fulfilled into, e.g. while
 * waiting out the webhook/confirm race after a client-side Stripe
 * confirmation. Deliberately a PLAIN `apiClient.get`, NOT `getWithRetry` —
 * a 404 here means the booking is still being reconciled server-side, and
 * `getWithRetry`'s built-in retries would triple every poll interval a
 * caller already implements on top of this.
 */
export async function getByHold(holdId: string): Promise<{ booking: Booking }> {
  const { data } = await apiClient.get(`/bookings/by-hold/${holdId}`)
  return data
}
