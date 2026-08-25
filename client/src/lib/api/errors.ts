import { isAxiosError } from 'axios'
import type { ApiError, ApiErrorCode } from '../types'

const MESSAGE_BY_CODE: Partial<Record<ApiErrorCode, string>> = {
  SEAT_UNAVAILABLE: 'Those seats were just taken. The map has been updated.',
  SEAT_NOT_FOUND: 'One or more selected seats could not be found.',
  DUPLICATE_EMAIL: 'An account with this email already exists.',
  INVALID_CREDENTIALS: 'Incorrect email or password.',
  SHOWTIME_NOT_FOUND: 'This showtime could not be found.',
  SHOWTIME_CANCELLED: 'This showtime is no longer open for booking.',
  SHOWTIME_STARTED: 'This showtime has already started and can no longer be changed.',
  FILM_NOT_FOUND: 'This film could not be found.',
  FILM_IN_USE: 'This film has showtimes scheduled against it and cannot be deleted.',
  CINEMA_NOT_FOUND: 'This cinema could not be found.',
  CINEMA_IN_USE: 'This cinema has showtimes scheduled against it and cannot be deleted.',
  SCREEN_NOT_FOUND: 'This screen could not be found.',
  HOLD_NOT_FOUND: 'This hold could not be found — it may have expired.',
  HOLD_EXPIRED: 'Your seat hold has expired. Please select your seats again.',
  PAYMENT_NOT_SUCCEEDED: 'Unable to confirm this booking. Please contact support if you believe this is an error.',
  PAYMENT_PROVIDER_UNAVAILABLE: 'The payment provider is temporarily unreachable. Please try again shortly.',
  ALLOCATION_FAILED: 'Your seats could not be allocated and your payment has been refunded. Please try booking again.',
  BOOKING_NOT_CANCELLABLE: 'This booking can no longer be cancelled.',
  RATE_LIMITED: 'Too many attempts. Please wait a moment and try again.',
  EMAIL_NOT_VERIFIED: 'Please verify your email address before continuing.',
  UNAUTHORIZED: 'Please sign in to continue.',
  // Deliberately generic: this code is shared between an expired JWT session
  // (401) and an expired/garbage verify-email or reset-password link (400) —
  // see client.ts's response interceptor for the full story. A wording that
  // works for both contexts avoids telling a 401'd user their "link" expired.
  TOKEN_EXPIRED: 'This link or session has expired. Please try again.',
  INVALID_TOKEN: 'This link or session is invalid. Please try again.',
  TOKEN_REVOKED: 'Your session has expired. Please sign in again.',
  FORBIDDEN: "You don't have permission to do that.",
  NETWORK_ERROR: 'Could not reach the server. Check your connection and try again.',
  INTERNAL_SERVER_ERROR: 'Something went wrong on our end. Please try again shortly.',
}

const DEFAULT_MESSAGE = 'Something went wrong. Please try again.'

/**
 * Normalise any thrown value from an API call into a consistent ApiError,
 * covering a well-formed error body, a malformed body, no response at all
 * (network failure), and a non-axios throw.
 */
function isAlreadyParsed(err: unknown): err is ApiError {
  return (
    typeof err === 'object' &&
    err !== null &&
    !(err instanceof Error) &&
    typeof (err as ApiError).code === 'string' &&
    typeof (err as ApiError).message === 'string'
  )
}

export function parseApiError(err: unknown): ApiError {
  // The axios response interceptor already runs every rejection through
  // this function once — pass an already-parsed ApiError straight through
  // instead of collapsing it into a generic error on a second parse.
  if (isAlreadyParsed(err)) {
    return err
  }

  if (isAxiosError(err)) {
    if (!err.response) {
      return { code: 'NETWORK_ERROR', message: MESSAGE_BY_CODE.NETWORK_ERROR! }
    }

    const body = err.response.data as { error?: { code?: string; message?: string; details?: unknown } } | undefined
    const code = (body?.error?.code as ApiErrorCode) || 'INTERNAL_SERVER_ERROR'
    const message = body?.error?.message || MESSAGE_BY_CODE[code] || DEFAULT_MESSAGE

    // `status` is what the response interceptor keys its logout-on-401
    // behaviour on (not `code` — see client.ts for why that collision
    // matters), so it must always be populated whenever a real HTTP
    // response came back.
    return { code, message, status: err.response.status, details: body?.error?.details }
  }

  if (err instanceof Error) {
    return { code: 'INTERNAL_SERVER_ERROR', message: err.message || DEFAULT_MESSAGE }
  }

  return { code: 'INTERNAL_SERVER_ERROR', message: DEFAULT_MESSAGE }
}
