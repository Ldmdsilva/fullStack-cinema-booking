import { describe, expect, it } from 'vitest'
import { getHealth } from './health'

describe('getHealth', () => {
  it('returns the server health payload', async () => {
    const health = await getHealth()
    expect(health.status).toBe('healthy')
    expect(health.db).toBe('connected')
  })
})
