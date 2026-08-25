import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { FilmCard } from './FilmCard'
import { filmA, filmB } from '@/test/fixtures'

function renderCard(film: Parameters<typeof FilmCard>[0]['film']) {
  return render(
    <MemoryRouter initialEntries={['/films']}>
      <Routes>
        <Route path="/films" element={<FilmCard film={film} />} />
        <Route path="/films/:id" element={<div data-testid="film-detail">{film.id}</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('FilmCard', () => {
  it('shows the certificate and runtime', () => {
    renderCard(filmA)
    // The certificate appears twice by design: once as the poster-overlay
    // badge, once as the ticket stub's eyebrow.
    expect(screen.getAllByText(filmA.certificate).length).toBeGreaterThan(0)
    expect(screen.getByText('1h 48m')).toBeInTheDocument()
  })

  it('shows the genre list', () => {
    renderCard(filmA)
    expect(screen.getByText(filmA.genre.join(' · '))).toBeInTheDocument()
  })

  it('shows a runtime under an hour without an hour segment', () => {
    renderCard(filmB)
    expect(screen.getByText('1h 36m')).toBeInTheDocument()
  })

  it('navigates to the film detail page when the poster is clicked', async () => {
    const user = userEvent.setup()
    renderCard(filmA)
    await user.click(screen.getByRole('button', { name: `View ${filmA.title}` }))
    expect(await screen.findByTestId('film-detail')).toHaveTextContent(filmA.id)
  })

  it('navigates to the film detail page when the ticket stub is clicked', async () => {
    const user = userEvent.setup()
    renderCard(filmA)
    await user.click(screen.getByText(filmA.title))
    expect(await screen.findByTestId('film-detail')).toHaveTextContent(filmA.id)
  })
})
