import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VerifyEmailPage } from './VerifyEmailPage'
import { renderPage } from '@/test/utils'

describe('VerifyEmailPage', () => {
  it('shows a loading spinner while the token is being verified', () => {
    renderPage(<VerifyEmailPage />, '/verify-email', { route: '/verify-email?token=good-token' })
    expect(screen.getByText(/verifying your email/i)).toBeInTheDocument()
  })

  it('shows a success message with a sign-in CTA for an anonymous visitor', async () => {
    renderPage(<VerifyEmailPage />, '/verify-email', { route: '/verify-email?token=good-token' })

    expect(await screen.findByText(/your email is verified/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument()
  })

  it('offers a "browse films" CTA instead when the visitor is already signed in', async () => {
    renderPage(<VerifyEmailPage />, '/verify-email', {
      route: '/verify-email?token=good-token',
      token: 'test-token',
    })

    expect(await screen.findByText(/your email is verified/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /browse films/i })).toBeInTheDocument()
  })

  it('shows a distinct message for an already-used token', async () => {
    renderPage(<VerifyEmailPage />, '/verify-email', { route: '/verify-email?token=used-token' })

    expect(await screen.findByRole('alert')).toHaveTextContent(/already been used/i)
  })

  it('shows a generic invalid-link message with a resend action for a signed-in visitor', async () => {
    const user = userEvent.setup()
    renderPage(<VerifyEmailPage />, '/verify-email', {
      route: '/verify-email?token=not-found-token',
      token: 'test-token',
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(/no longer valid/i)
    await user.click(screen.getByRole('button', { name: /resend verification email/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /verification email sent/i })).toBeInTheDocument())
  })

  it('points an anonymous visitor with an invalid token to sign in, not resend', async () => {
    renderPage(<VerifyEmailPage />, '/verify-email', { route: '/verify-email?token=not-found-token' })

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /go to sign in/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /resend/i })).not.toBeInTheDocument()
  })

  it('treats a missing token as invalid without calling the server', async () => {
    renderPage(<VerifyEmailPage />, '/verify-email', { route: '/verify-email' })

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /go to sign in/i })).toBeInTheDocument()
  })
})
