import { getWithRetry } from './client'

export interface LastMailResponse {
  to: string
  subject: string
  html: string
  text: string
  sentAt: string
}

/**
 * D13 dev-only endpoint (server/src/routes/devRoutes.js, mounted only when
 * NODE_ENV !== 'production') — reads the last email sent to an address, so
 * e2e specs can pull a verification/reset link without a real mailbox.
 */
export async function getLastMail(email: string): Promise<LastMailResponse> {
  return getWithRetry('/dev/last-mail', { params: { email } })
}
