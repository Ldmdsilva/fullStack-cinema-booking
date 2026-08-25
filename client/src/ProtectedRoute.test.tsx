// ProtectedRoute (and AdminRoute) are small route guards defined privately
// inside App.tsx rather than exported on their own — they're exercised here
// through the real App tree with the browser location seeded via
// `window.history`, exactly how react-router's BrowserRouter (which App
// creates internally) reads its starting location.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { setToken } from '@/lib/tokenStore'

function goTo(path: string) {
  window.history.pushState({}, '', path)
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    goTo('/')
  })
  afterEach(() => {
    goTo('/')
  })

  it('shows a spinner while the session is still being checked', () => {
    // Only the "verify an existing token" bootstrap path actually awaits
    // anything (GET /users/me) — with no token at all, AuthContext settles
    // to 'anonymous' synchronously, so a token is what makes 'loading'
    // observable here.
    setToken('test-token')
    goTo('/bookings')
    render(<App />)
    expect(screen.getByText(/checking your session/i)).toBeInTheDocument()
  })

  it('redirects an anonymous visitor to /login, preserving the original path as `from`', async () => {
    goTo('/bookings')
    render(<App />)

    expect(await screen.findByRole('heading', { name: /sign in to encore/i })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/login')

    // Signing in from here should land back on the page that was originally
    // requested, proving `from` survived the redirect. The tab switcher and
    // the submit button both read "Sign in" — only the submit button has
    // type="submit".
    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/^email$/i), 'alex@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'Password123')
    const submit = screen
      .getAllByRole('button', { name: /^sign in$/i })
      .find((b) => b.getAttribute('type') === 'submit')!
    await user.click(submit)

    await waitFor(() => expect(screen.getByRole('heading', { name: /my tickets/i })).toBeInTheDocument())
    expect(window.location.pathname).toBe('/bookings')
  })

  it('renders the protected page directly for an already-authenticated visitor', async () => {
    setToken('test-token')
    goTo('/bookings')
    render(<App />)

    expect(await screen.findByRole('heading', { name: /my tickets/i })).toBeInTheDocument()
  })
})
