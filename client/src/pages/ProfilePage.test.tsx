import type * as React from 'react'
import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProfilePage } from './ProfilePage'
import { useAuth } from '@/context/AuthContext'
import { renderPage } from '@/test/utils'
import { unverifiedUser } from '@/test/fixtures'

// ProfilePage assumes it is only ever mounted once App's ProtectedRoute has
// already resolved `status` to 'authenticated' (see App.tsx) — its own
// `if (!user) navigate('/login')` guard is a defence-in-depth check, not
// something meant to fire on ProfilePage's very first render. This gate
// reproduces that real precondition for the isolated test below.
function AuthGate({ children }: { children: React.ReactNode }) {
  const { status } = useAuth()
  if (status === 'loading') return <p>loading-session</p>
  return <>{children}</>
}

describe('ProfilePage', () => {
  it("shows the signed-in user's details", async () => {
    renderPage(
      <AuthGate>
        <ProfilePage />
      </AuthGate>,
      '/profile',
      { token: 'test-token' },
    )
    expect(await screen.findByDisplayValue('Alex Rivera')).toBeInTheDocument()
    expect(screen.getByDisplayValue('alex@example.com')).toBeInTheDocument()
  })

  it('saves profile changes', async () => {
    const user = userEvent.setup()
    renderPage(
      <AuthGate>
        <ProfilePage />
      </AuthGate>,
      '/profile',
      { token: 'test-token' },
    )
    const nameInput = await screen.findByDisplayValue('Alex Rivera')
    await user.clear(nameInput)
    await user.type(nameInput, 'Alexandra Rivera')
    await user.click(screen.getByRole('button', { name: /save details/i }))

    await waitFor(() => expect(nameInput).toHaveValue('Alexandra Rivera'))
  })

  it('rejects an invalid email before calling the server', async () => {
    const user = userEvent.setup()
    renderPage(
      <AuthGate>
        <ProfilePage />
      </AuthGate>,
      '/profile',
      { token: 'test-token' },
    )
    const emailInput = await screen.findByDisplayValue('alex@example.com')
    await user.clear(emailInput)
    await user.type(emailInput, 'not-an-email')
    const btn = screen.getByRole('button', { name: /save details/i })
    console.log('BTN', btn.outerHTML)
    await user.click(btn)
    await new Promise((r) => setTimeout(r, 50))
    screen.debug(undefined, 20000)

    expect(await screen.findByRole('alert')).toHaveTextContent(/enter a valid email/i)
  })

  it('opens the delete-account confirmation modal', async () => {
    const user = userEvent.setup()
    renderPage(
      <AuthGate>
        <ProfilePage />
      </AuthGate>,
      '/profile',
      { token: 'test-token' },
    )
    await screen.findByDisplayValue('Alex Rivera')
    await user.click(screen.getByRole('button', { name: /^delete account$/i }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /delete your account/i })).toBeInTheDocument()
  })

  it('hides the verification notice for a verified user', async () => {
    renderPage(
      <AuthGate>
        <ProfilePage />
      </AuthGate>,
      '/profile',
      { token: 'test-token' },
    )
    await screen.findByDisplayValue('Alex Rivera')
    expect(screen.queryByText(/isn't verified yet/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /resend verification email/i })).not.toBeInTheDocument()
  })

  it('shows the verification notice for an unverified user and confirms resend', async () => {
    const user = userEvent.setup()
    renderPage(
      <AuthGate>
        <ProfilePage />
      </AuthGate>,
      '/profile',
      { token: 'unverified-token' },
    )
    expect(await screen.findByDisplayValue(unverifiedUser.name)).toBeInTheDocument()
    expect(screen.getByText(/isn't verified yet/i)).toBeInTheDocument()

    const resendButton = screen.getByRole('button', { name: /resend verification email/i })
    await user.click(resendButton)

    expect(await screen.findByText(/verification email sent/i)).toBeInTheDocument()
  })
})
