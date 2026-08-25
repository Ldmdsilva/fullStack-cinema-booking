import axios from 'axios'
import { getToken, setToken } from '../tokenStore'
import { parseApiError } from './errors'

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
})

apiClient.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`)
  }
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const apiError = parseApiError(error)

    // Client guards are UX only — the server authorises every write. This
    // interceptor just reacts to a 401 the server already enforced.
    //
    // Deliberately keyed on HTTP `status`, NOT `code`: TOKEN_EXPIRED and
    // INVALID_TOKEN are ALSO the exact codes the server returns for an
    // expired/garbage email-verification or password-reset link, which come
    // back as 400, not 401 (see middleware/auth.js vs authService's token
    // consumption path). Keying on `code` would log a user out of their
    // ACTIVE session purely because they clicked an old verification link —
    // checking `status === 401` (the status every auth-required-but-
    // missing/invalid/expired/revoked JWT case actually uses, per
    // middleware/auth.js and middleware/verifiedGuard.js) avoids that
    // collision entirely; a 400 never reaches this branch.
    if (apiError.status === 401 && typeof window !== 'undefined') {
      setToken(null)
      if (window.location.pathname !== '/login') {
        window.location.assign('/login')
      }
    }

    return Promise.reject(apiError)
  },
)

/**
 * Retry a GET request up to 3 times with exponential backoff. Never used
 * for writes — POST /bookings in particular must never be retried (§C7.3),
 * since a retried hold attempt could double-charge the seat guard's 409
 * semantics or create a duplicate Stripe session.
 */
export async function getWithRetry<T>(url: string, config?: Parameters<typeof apiClient.get>[1], attempt = 0): Promise<T> {
  try {
    const response = await apiClient.get<T>(url, config)
    return response.data
  } catch (error) {
    if (attempt >= 2) throw error
    const delayMs = 300 * 2 ** attempt
    await new Promise((resolve) => setTimeout(resolve, delayMs))
    return getWithRetry<T>(url, config, attempt + 1)
  }
}
