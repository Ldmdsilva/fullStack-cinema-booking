import * as React from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import * as authApi from '@/lib/api/auth'
import { parseApiError } from '@/lib/api/errors'
import type { ApiError } from '@/lib/types'

type ResetState = { status: 'form' } | { status: 'success' } | { status: 'error'; error: ApiError }

const errorMessage = (error: ApiError) => {
  if (error.code === 'TOKEN_USED') {
    return 'This reset link has already been used. Please request a new one.'
  }
  return 'This reset link is no longer valid. It may have expired — please request a new one.'
}

// A 400 TOKEN_EXPIRED/TOKEN_NOT_FOUND/TOKEN_USED here does NOT trigger the
// global logout/redirect (see VerifyEmailPage's note — same endpoint family,
// same client.ts fix), so this page can safely render its own inline error.
export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const [password, setPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')
  const [fieldError, setFieldError] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [state, setState] = React.useState<ResetState>({ status: 'form' })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFieldError('')

    if (!token) {
      setState({
        status: 'error',
        error: { code: 'TOKEN_NOT_FOUND', message: 'This reset link is missing its token.' },
      })
      return
    }
    if (password.length < 8) {
      setFieldError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setFieldError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      // Field name is `password`, not `newPassword` — matches the real
      // wire contract (resetPasswordSchema); the server maps it internally.
      await authApi.resetPassword({ token, password })
      setState({ status: 'success' })
    } catch (err) {
      setState({ status: 'error', error: parseApiError(err) })
    } finally {
      setLoading(false)
    }
  }

  if (state.status === 'success') {
    return (
      <div className="mx-auto flex max-w-md flex-col px-5 py-16 text-center">
        <p className="eyebrow text-stamp-red">Your account</p>
        <h1 className="mt-3 font-voice text-[36px] font-medium tracking-[-0.02em]">Password reset</h1>
        <div className="mt-8 rounded-[var(--radius-card)] border-[0.5px] border-border bg-card p-6">
          {/* D14/FR-15 — a reset revokes all existing JWTs and issues no new
              one; `login` remains the only token issuer, so we never
              auto-sign the user in here. */}
          <p className="text-[15px] text-text-secondary">Your password has been reset — please log in again.</p>
          <Button className="mt-6" size="lg" fullWidth onClick={() => navigate('/login')}>
            Go to sign in
          </Button>
        </div>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="mx-auto flex max-w-md flex-col px-5 py-16 text-center">
        <p className="eyebrow text-stamp-red">Your account</p>
        <h1 className="mt-3 font-voice text-[36px] font-medium tracking-[-0.02em]">Reset link invalid</h1>
        <div className="mt-8 rounded-[var(--radius-card)] border-[0.5px] border-border bg-card p-6">
          <p role="alert" className="text-[15px] text-destructive">
            {errorMessage(state.error)}
          </p>
          <Link
            to="/forgot-password"
            className="mt-6 inline-block text-[13px] text-text-secondary hover:text-foreground"
          >
            Request a new link
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-md flex-col px-5 py-16">
      <p className="eyebrow text-stamp-red">Your account</p>
      <h1 className="mt-3 font-voice text-[36px] font-medium tracking-[-0.02em]">Reset your password</h1>
      <p className="mt-2 text-[15px] text-text-secondary">Choose a new password for your account.</p>

      <div className="mt-8 rounded-[var(--radius-card)] border-[0.5px] border-border bg-card p-6">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Input
            label="New password"
            type="password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
          <Input
            label="Confirm new password"
            type="password"
            placeholder="Repeat your new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
          {fieldError && (
            <p role="alert" className="text-[13px] text-destructive">
              {fieldError}
            </p>
          )}
          <Button type="submit" size="lg" fullWidth isLoading={loading}>
            Reset password
          </Button>
        </form>
        <Link to="/login" className="mt-4 inline-block text-[13px] text-text-secondary hover:text-foreground">
          Back to sign in
        </Link>
      </div>
    </div>
  )
}
