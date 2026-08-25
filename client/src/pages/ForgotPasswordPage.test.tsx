import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ForgotPasswordPage } from './ForgotPasswordPage'
import { renderPage } from '@/test/utils'

describe('ForgotPasswordPage', () => {
  it('validates the email before contacting the server', async () => {
    const user = userEvent.setup()
    renderPage(<ForgotPasswordPage />, '/forgot-password')

    await user.type(screen.getByLabelText(/^email$/i), 'not-an-email')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    expect(await screen.findByText(/enter a valid email address/i)).toBeInTheDocument()
  })

  it('shows the same generic confirmation regardless of whether the account exists', async () => {
    const user = userEvent.setup()
    renderPage(<ForgotPasswordPage />, '/forgot-password')

    await user.type(screen.getByLabelText(/^email$/i), 'nobody@example.com')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    expect(await screen.findByText(/if an account exists for that email/i)).toBeInTheDocument()
    // The form itself disappears once submitted — there is no separate
    // "email not found" state to leak the account's existence.
    expect(screen.queryByLabelText(/^email$/i)).not.toBeInTheDocument()
  })

  it('has a link back to sign in', () => {
    renderPage(<ForgotPasswordPage />, '/forgot-password')
    expect(screen.getByRole('link', { name: /back to sign in/i })).toHaveAttribute('href', '/login')
  })
})
