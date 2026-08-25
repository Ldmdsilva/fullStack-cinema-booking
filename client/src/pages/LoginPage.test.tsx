import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginPage } from './LoginPage'
import { renderPage, renderRoutes } from '@/test/utils'

function Destination({ label }: { label: string }) {
  return <p>{label}</p>
}

// The sign-in tab button and the form's submit button both read "Sign in" —
// only the submit button has type="submit", which disambiguates them.
function signInSubmitButton(): HTMLElement {
  const button = screen
    .getAllByRole('button', { name: /^sign in$/i })
    .find((b) => b.getAttribute('type') === 'submit')
  if (!button) throw new Error('sign-in submit button not found')
  return button
}

describe('LoginPage', () => {
  it('shows inline field errors for invalid registration input without calling the server', async () => {
    const user = userEvent.setup()
    renderPage(<LoginPage />, '/register')

    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(await screen.findByText(/enter your full name/i)).toBeInTheDocument()
    expect(screen.getByText(/enter a valid email address/i)).toBeInTheDocument()
    expect(screen.getByText(/enter a valid sri lankan mobile number/i)).toBeInTheDocument()
    expect(screen.getByText(/password must be at least 8 characters/i)).toBeInTheDocument()
  })

  it('rejects a malformed phone number on registration', async () => {
    const user = userEvent.setup()
    renderPage(<LoginPage />, '/register')

    await user.type(screen.getByLabelText(/full name/i), 'Alex Rivera')
    await user.type(screen.getByLabelText(/^email$/i), 'alex@example.com')
    await user.type(screen.getByLabelText(/mobile number/i), '12345')
    await user.type(screen.getByLabelText(/^password$/i), 'password123')
    await user.type(screen.getByLabelText(/confirm password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(await screen.findByText(/enter a valid sri lankan mobile number/i)).toBeInTheDocument()
  })

  it('accepts a valid Sri Lankan mobile number and shows a verify-your-email confirmation, without logging in', async () => {
    const user = userEvent.setup()
    renderRoutes(
      [
        { path: '/register', element: <LoginPage /> },
        { path: '/bookings', element: <Destination label="destination" /> },
      ],
      { route: '/register' },
    )

    await user.type(screen.getByLabelText(/full name/i), 'Alex Rivera')
    await user.type(screen.getByLabelText(/^email$/i), 'new@example.com')
    await user.type(screen.getByLabelText(/mobile number/i), '0771234567')
    await user.type(screen.getByLabelText(/^password$/i), 'password123')
    await user.type(screen.getByLabelText(/confirm password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    // D14 — register never logs the user in, so it never navigates to
    // `from`; it shows an inline confirmation instead.
    expect(await screen.findByRole('heading', { name: /check your email/i })).toBeInTheDocument()
    expect(screen.queryByText('destination')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/full name/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /go to sign in/i }))
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/confirm password/i)).not.toBeInTheDocument()
  })

  it('shows a Forgot password link on the sign-in form pointing at /forgot-password', () => {
    renderPage(<LoginPage />, '/login')
    expect(screen.getByRole('link', { name: /forgot password/i })).toHaveAttribute('href', '/forgot-password')
  })

  it('shows a generic message on invalid credentials, never revealing whether the account exists', async () => {
    const user = userEvent.setup()
    renderPage(<LoginPage />, '/login')

    await user.type(screen.getByLabelText(/^email$/i), 'nobody@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'wrongpassword')
    await user.click(signInSubmitButton())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Incorrect email or password.')
    expect(alert).not.toHaveTextContent(/exist|not found|unknown/i)
  })

  it('requires a well-formed email and 8+ character password before contacting the server on sign-in', async () => {
    const user = userEvent.setup()
    renderPage(<LoginPage />, '/login')

    await user.type(screen.getByLabelText(/^email$/i), 'not-an-email')
    await user.type(screen.getByLabelText(/^password$/i), 'short')
    await user.click(signInSubmitButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(/enter a valid email and password/i)
  })

  it('signs in successfully and navigates to the preserved `from` location', async () => {
    const user = userEvent.setup()
    renderRoutes(
      [
        { path: '/login', element: <LoginPage /> },
        { path: '/checkout/event-1', element: <Destination label="destination" /> },
      ],
      { route: { pathname: '/login', state: { from: '/checkout/event-1' } } },
    )

    await user.type(screen.getByLabelText(/^email$/i), 'alex@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'Password123')
    await user.click(signInSubmitButton())

    await waitFor(() => expect(screen.getByText('destination')).toBeInTheDocument())
  })
})
