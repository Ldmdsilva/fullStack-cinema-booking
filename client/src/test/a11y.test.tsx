import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { axe } from 'jest-axe'
import { FilmListPage } from '@/pages/FilmListPage'
import { ShowtimePage } from '@/pages/ShowtimePage'
import { LoginPage } from '@/pages/LoginPage'
import { CheckoutPage } from '@/pages/CheckoutPage'
import { renderPage } from '@/test/utils'
import { showtimeSummaryA, holdA, filmA } from '@/test/fixtures'

const SHOWTIME_ID = showtimeSummaryA.id

describe('accessibility (jest-axe)', () => {
  it('FilmListPage has no axe violations once loaded', async () => {
    const { container } = renderPage(<FilmListPage />, '/films')
    await screen.findByText(new RegExp(filmA.title, 'i'))

    expect(await axe(container)).toHaveNoViolations()
  })

  it('ShowtimePage has no axe violations once the seat map loads', async () => {
    const { container } = renderPage(<ShowtimePage />, '/showtimes/:id', { route: `/showtimes/${SHOWTIME_ID}` })
    await screen.findByRole('group', { name: /seat selection map/i })

    expect(await axe(container)).toHaveNoViolations()
  })

  it('LoginPage has no axe violations, in both sign-in and register mode', async () => {
    const { container, unmount } = renderPage(<LoginPage />, '/login')
    await screen.findByRole('heading', { name: /sign in to encore/i })
    expect(await axe(container)).toHaveNoViolations()
    unmount()

    const { container: registerContainer } = renderPage(<LoginPage />, '/register')
    await screen.findByRole('heading', { name: /create an account/i })
    expect(await axe(registerContainer)).toHaveNoViolations()
  })

  it('CheckoutPage has no axe violations for a live hold', async () => {
    const { container } = renderPage(<CheckoutPage />, '/checkout/:holdId', { route: `/checkout/${holdA.holdId}` })
    await waitFor(() => expect(screen.getByRole('heading', { name: /checkout/i })).toBeInTheDocument())

    expect(await axe(container)).toHaveNoViolations()
  })
})
