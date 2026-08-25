import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import * as cinemasApi from './cinemas'
import { cinemaA } from '@/test/fixtures'

describe('cinemas api', () => {
  it('lists cinemas as a flat array, unwrapping the {items} envelope (no pagination metadata)', async () => {
    const cinemas = await cinemasApi.list()
    expect(Array.isArray(cinemas)).toBe(true)
    expect(cinemas.length).toBeGreaterThan(0)
    expect(cinemas[0]).not.toHaveProperty('screens')
  })

  it('fetches a single cinema by id with full screen detail, unwrapping the {cinema} envelope', async () => {
    const cinema = await cinemasApi.getById(cinemaA.id)
    expect(cinema.id).toBe(cinemaA.id)
    expect(cinema.screens.length).toBeGreaterThan(0)
  })

  it('rejects with CINEMA_NOT_FOUND for an unknown id', async () => {
    await expect(cinemasApi.getById('nope')).rejects.toMatchObject({ code: 'CINEMA_NOT_FOUND' })
  })

  it('creates a cinema', async () => {
    const cinema = await cinemasApi.create({
      name: 'New Hall',
      address: '1 Main St',
      city: 'Kandy',
      screens: [{ screenId: 'screen-1', name: 'Screen 1', seatLayout: [{ id: 'A-1', section: 'STANDARD', row: 'A', number: 1 }] }],
    })
    expect(cinema.name).toBe('New Hall')
  })

  it('updates a cinema via PATCH', async () => {
    let methodUsed: string | undefined
    server.use(
      http.patch('/api/cinemas/:id', async ({ request, params }) => {
        methodUsed = request.method
        const body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ cinema: { ...cinemaA, id: params.id, ...body } })
      }),
    )
    const cinema = await cinemasApi.update(cinemaA.id, { city: 'Jaffna' })
    expect(cinema.city).toBe('Jaffna')
    expect(methodUsed).toBe('PATCH')
  })

  it('deletes a cinema', async () => {
    await expect(cinemasApi.remove(cinemaA.id)).resolves.toBeUndefined()
  })

  it('surfaces CINEMA_IN_USE when deletion is blocked', async () => {
    await expect(cinemasApi.remove('cinema-in-use')).rejects.toMatchObject({ code: 'CINEMA_IN_USE' })
  })
})
