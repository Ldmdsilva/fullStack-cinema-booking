import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import * as filmsApi from './films'
import { filmA } from '@/test/fixtures'

describe('films api', () => {
  it('lists films with pagination metadata', async () => {
    const result = await filmsApi.list({ page: 1, limit: 10 })
    expect(result.items.length).toBeGreaterThan(0)
    expect(result).toMatchObject({ page: 1, limit: 10 })
  })

  it('fetches a film by id, unwrapping the {film} envelope', async () => {
    const film = await filmsApi.getById(filmA.id)
    expect(film.id).toBe(filmA.id)
    expect(film.title).toBe(filmA.title)
  })

  it('rejects with FILM_NOT_FOUND for an unknown id', async () => {
    await expect(filmsApi.getById('nope')).rejects.toMatchObject({ code: 'FILM_NOT_FOUND' })
  })

  it('creates a film via POST /films', async () => {
    const film = await filmsApi.create({
      title: 'New Film',
      synopsis: 'desc',
      certificate: 'PG',
      runtimeMinutes: 100,
      genre: ['Drama'],
      releaseDate: '2026-12-01T00:00:00.000Z',
    })
    expect(film.title).toBe('New Film')
  })

  it('updates a film via PUT (not PATCH)', async () => {
    let methodUsed: string | undefined
    server.use(
      http.put('/api/films/:id', async ({ request, params }) => {
        methodUsed = request.method
        const body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ film: { ...filmA, id: params.id, ...body } })
      }),
      http.patch('/api/films/:id', () => {
        methodUsed = 'PATCH'
        return HttpResponse.json({ film: filmA })
      }),
    )
    const film = await filmsApi.update(filmA.id, { title: 'Updated Title' })
    expect(film.title).toBe('Updated Title')
    expect(methodUsed).toBe('PUT')
  })

  it('deletes a film', async () => {
    await expect(filmsApi.remove(filmA.id)).resolves.toBeUndefined()
  })

  it('surfaces FILM_IN_USE when deletion is blocked', async () => {
    await expect(filmsApi.remove('film-in-use')).rejects.toMatchObject({ code: 'FILM_IN_USE' })
  })
})
