import { getWithRetry } from './client'

export interface HealthResponse {
  status: 'healthy' | 'unhealthy'
  db: 'connected' | 'disconnected'
  uptime: number
  timestamp: string
}

export async function getHealth(): Promise<HealthResponse> {
  return getWithRetry('/health')
}
