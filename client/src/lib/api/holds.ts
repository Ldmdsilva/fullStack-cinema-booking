import { apiClient, getWithRetry } from './client'
import type { CreateHoldPaymentIntentResponse, CreateHoldPayload, CreateHoldResponse, Hold } from '../types'

/**
 * Create a seat hold. Never retried — a retried hold attempt could
 * double-submit against the atomic seat guard (§C7.3).
 */
export async function create(payload: CreateHoldPayload): Promise<CreateHoldResponse> {
  const { data } = await apiClient.post('/holds', payload)
  return data
}

export async function getById(id: string): Promise<Hold> {
  return getWithRetry(`/holds/${id}`)
}

/**
 * Create (or, on retry, re-retrieve) the Stripe PaymentIntent for an
 * existing hold. Never retried automatically for the same reason as `create`.
 */
export async function createPaymentIntent(holdId: string): Promise<CreateHoldPaymentIntentResponse> {
  const { data } = await apiClient.post(`/holds/${holdId}/payment-intent`)
  return data
}

// 204 with no body (holdController.releaseHold) — idempotent.
export async function release(id: string): Promise<void> {
  await apiClient.delete(`/holds/${id}`)
}
