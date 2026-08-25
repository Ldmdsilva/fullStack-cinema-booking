import * as React from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import * as authApi from '@/lib/api/auth'
import { parseApiError } from '@/lib/api/errors'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function ForgotPasswordPage() {
  const [email, setEmail] = React.useState('')
  const [fieldError, setFieldError] = React.useState('')
  const [error, setError] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [submitted, setSubmitted] = React.useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!EMAIL_RE.test(email)) {
      setFieldError('Enter a valid email address.')
      return
    }
    setFieldError('')

    setLoading(true)
    try {
      await authApi.forgotPassword({ email })
      setSubmitted(true)
    } catch (err) {
      // The endpoint itself never reports "email not found" (anti-
      // enumeration) — this only fires for a genuine transport/server
      // failure, never for an unrecognised address.
      setError(parseApiError(err).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col px-5 py-16">
      <p className="eyebrow text-stamp-red">Your account</p>
      <h1 className="mt-3 font-voice text-[36px] font-medium tracking-[-0.02em]">Forgot your password?</h1>
      <p className="mt-2 text-[15px] text-text-secondary">
        Enter the email address on your account and we'll send you a link to reset your password.
      </p>

      <div className="mt-8 rounded-[var(--radius-card)] border-[0.5px] border-border bg-card p-6">
        {submitted ? (
          <p className="text-[15px] text-text-secondary">
            If an account exists for that email, we've sent a password reset link. Please check your inbox.
          </p>
        ) : (
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            <Input
              label="Email"
              type="email"
              placeholder="name@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              error={fieldError}
              required
            />
            {error && (
              <p role="alert" className="text-[13px] text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" fullWidth isLoading={loading}>
              Send reset link
            </Button>
          </form>
        )}

        <Link to="/login" className="mt-4 inline-block text-[13px] text-text-secondary hover:text-foreground">
          Back to sign in
        </Link>
      </div>
    </div>
  )
}
