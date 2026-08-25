import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ResetPasswordPage } from './ResetPasswordPage'
import { renderPage } from '@/test/utils'

describe('ResetPasswordPage', () => {
  it('requires an 8+ character password before contacting the server', async () => {
    const user = userEvent.setup()
    renderPage(<ResetPasswordPage />, '/reset-password', { route: '/reset-password?token=good-token' })

    await user.type(screen.getByLabelText(/^new password$/i), 'short')
    await user.type(screen.getByLabelText(/confirm new password/i), 'short')
    await user.click(screen.getByRole('button', { name: /^reset password$/i }))

    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument()
  })

  it('rejects mismatched passwords before contacting the server', async () => {
    const user = userEvent.setup()
    renderPage(<ResetPasswordPage />, '/reset-password', { route: '/reset-password?token=good-token' })

    await user.type(screen.getByLabelText(/^new password$/i), 'password123')
    await user.type(screen.getByLabelText(/confirm new password/i), 'password456')
    await user.click(screen.getByRole('button', { name: /^reset password$/i }))

    expect(await screen.findByText(/do not match/i)).toBeInTheDocument()
  })

  it('resets the password and shows a confirmation with no auto sign-in', async () => {
    const user = userEvent.setup()
    renderPage(<ResetPasswordPage />, '/reset-password', { route: '/reset-password?token=good-token' })

    await user.type(screen.getByLabelText(/^new password$/i), 'password123')
    await user.type(screen.getByLabelText(/confirm new password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /^reset password$/i }))

    expect(await screen.findByText(/password has been reset/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /go to sign in/i })).toBeInTheDocument()
  })

  it('shows a distinct message for an already-used token', async () => {
    const user = userEvent.setup()
    renderPage(<ResetPasswordPage />, '/reset-password', { route: '/reset-password?token=used-token' })

    await user.type(screen.getByLabelText(/^new password$/i), 'password123')
    await user.type(screen.getByLabelText(/confirm new password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /^reset password$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/already been used/i)
    expect(screen.getByRole('link', { name: /request a new link/i })).toHaveAttribute('href', '/forgot-password')
  })

  it('shows a generic invalid-link message for an unknown/expired token', async () => {
    const user = userEvent.setup()
    renderPage(<ResetPasswordPage />, '/reset-password', { route: '/reset-password?token=bad' })

    await user.type(screen.getByLabelText(/^new password$/i), 'password123')
    await user.type(screen.getByLabelText(/confirm new password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /^reset password$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/no longer valid/i)
  })
})
