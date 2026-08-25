import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { HomePage } from './HomePage'
import { renderPage } from '@/test/utils'
import { server } from '@/test/mocks/server'

describe('HomePage', () => {
  it('renders the hero and featured films once loaded', async () => {
    renderPage(<HomePage />, '/')
    expect(await screen.findByRole('heading', { level: 1, name: /pick your seat/i })).toBeInTheDocument()
    expect(await screen.findAllByText(/the marfa sessions/i)).not.toHaveLength(0)
  })

  it('shows an empty state when there are no films on sale', async () => {
    server.use(
      http.get('/api/films', () => HttpResponse.json({ items: [], total: 0, page: 1, limit: 4, totalPages: 1 })),
    )
    renderPage(<HomePage />, '/')
    // Rendered in both the hero slot and the "Now showing" section.
    expect(await screen.findAllByText(/no films on sale yet/i)).toHaveLength(2)
  })
})
