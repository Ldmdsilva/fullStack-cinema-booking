import * as React from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/context/AuthContext'
import { parseApiError } from '@/lib/api/errors'
import { cn } from '@/lib/utils'

type Mode = 'signin' | 'register'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Loose Sri Lankan mobile check — the server's `normaliseLk` is the final
// authority and normalises whatever loosely-valid format the user types.
const PHONE_RE = /^(0|\+94|94)?7[0-9]{8}$/

interface FieldErrors {
  name?: string
  email?: string
  password?: string
  confirmPassword?: string
  phone?: string
}

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, register } = useAuth()
  const from = (location.state as { from?: string } | null)?.from ?? '/bookings'

  const [mode, setMode] = React.useState<Mode>(location.pathname === '/register' ? 'register' : 'signin')
  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')
  const [error, setError] = React.useState('')
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({})
  const [loading, setLoading] = React.useState(false)
  // Set once registration succeeds — D14: register never logs the user in,
  // so instead of navigating away we replace the form with a confirmation
  // and a way back to the sign-in tab.
  const [registeredMessage, setRegisteredMessage] = React.useState<string | null>(null)

  const reset = (next: Mode) => {
    setMode(next)
    setError('')
    setFieldErrors({})
    setRegisteredMessage(null)
    setName('')
    setEmail('')
    setPhone('')
    setPassword('')
    setConfirmPassword('')
  }

  const validate = (): FieldErrors | null => {
    const errs: FieldErrors = {}

    if (mode === 'register') {
      if (name.trim().length < 2) errs.name = 'Enter your full name (at least 2 characters).'
      if (!EMAIL_RE.test(email)) errs.email = 'Enter a valid email address.'
      if (!PHONE_RE.test(phone.replace(/\s/g, ''))) {
        errs.phone = 'Enter a valid Sri Lankan mobile number, e.g. 0771234567.'
      }
      if (password.length < 8) errs.password = 'Password must be at least 8 characters.'
      if (password !== confirmPassword) errs.confirmPassword = 'Passwords do not match.'
    }

    return Object.keys(errs).length > 0 ? errs : null
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setFieldErrors({})

    if (mode === 'signin' && (!EMAIL_RE.test(email) || password.length < 8)) {
      setError('Enter a valid email and password to continue.')
      return
    }

    const errs = validate()
    if (errs) {
      setFieldErrors(errs)
      return
    }

    setLoading(true)
    try {
      if (mode === 'register') {
        const result = await register({ name: name.trim(), email, password, phone: phone.trim() })
        setRegisteredMessage(result.message)
      } else {
        await login({ email, password })
        navigate(from, { replace: true })
      }
    } catch (err) {
      const apiError = parseApiError(err)
      const knownFields: (keyof FieldErrors)[] = ['name', 'email', 'password', 'phone']
      if (apiError.code === 'VALIDATION_ERROR' && Array.isArray(apiError.details)) {
        const next: FieldErrors = {}
        for (const d of apiError.details as { field?: string; message?: string }[]) {
          const field = knownFields.find((f) => f === d.field)
          if (field) next[field] = d.message ?? 'Invalid value.'
        }
        if (Object.keys(next).length > 0) {
          setFieldErrors(next)
        } else {
          setError(apiError.message)
        }
      } else if (apiError.code === 'INVALID_CREDENTIALS' || apiError.code === 'UNAUTHORIZED') {
        // Never reveal whether the account exists or the password was wrong.
        setError('Incorrect email or password.')
      } else {
        setError(apiError.message)
      }
    } finally {
      setLoading(false)
    }
  }

  const tabClass = (t: Mode) =>
    cn(
      'flex-1 py-2.5 text-[14px] font-medium transition-colors border-b-2',
      mode === t
        ? 'border-stamp-red text-foreground'
        : 'border-transparent text-text-secondary hover:text-foreground',
    )

  if (mode === 'register' && registeredMessage) {
    return (
      <div className="mx-auto flex max-w-md flex-col px-5 py-16 text-center">
        <p className="eyebrow text-stamp-red">Almost there</p>
        <h1 className="mt-3 font-voice text-[36px] font-medium tracking-[-0.02em]">Check your email</h1>
        <p className="mt-2 text-[15px] text-text-secondary">
          {registeredMessage || 'Check your email to verify your account, then sign in.'}
        </p>

        <div className="mt-8 rounded-[var(--radius-card)] border-[0.5px] border-border bg-card p-6">
          <p className="text-[14px] text-text-secondary">
            We've sent a verification link to your inbox. Once verified, sign in to start booking.
          </p>
          <Button className="mt-6" size="lg" fullWidth onClick={() => reset('signin')}>
            Go to sign in
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-md flex-col px-5 py-16">
      <p className="eyebrow text-stamp-red">Your account</p>
      <h1 className="mt-3 font-voice text-[36px] font-medium tracking-[-0.02em]">
        {mode === 'signin' ? 'Sign in to Encore' : 'Create an account'}
      </h1>
      <p className="mt-2 text-[15px] text-text-secondary">
        {mode === 'signin'
          ? 'Sign in to book seats and keep your ticket stubs in one place.'
          : 'Register to start booking concerts and track your tickets.'}
      </p>

      <div className="mt-8 rounded-[var(--radius-card)] border-[0.5px] border-border bg-card overflow-hidden">
        {/* Tab switcher */}
        <div className="flex border-b-[0.5px] border-border">
          <button type="button" className={tabClass('signin')} onClick={() => reset('signin')}>
            Sign in
          </button>
          <button type="button" className={tabClass('register')} onClick={() => reset('register')}>
            Register
          </button>
        </div>

        <form onSubmit={submit} noValidate className="flex flex-col gap-4 p-6">
          {mode === 'register' && (
            <Input
              label="Full name"
              type="text"
              placeholder="Alex Rivera"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              error={fieldErrors.name}
              required
            />
          )}
          <Input
            label="Email"
            type="email"
            placeholder="name@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            error={fieldErrors.email}
            required
          />
          {mode === 'register' && (
            <Input
              label="Mobile number"
              type="tel"
              placeholder="0771234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              error={fieldErrors.phone}
              hint={!fieldErrors.phone ? 'A Sri Lankan mobile number — used for booking confirmations.' : undefined}
              required
            />
          )}
          <Input
            label="Password"
            type="password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            error={fieldErrors.password}
            required
          />
          {mode === 'signin' && (
            <Link
              to="/forgot-password"
              className="-mt-2 self-end text-[13px] text-text-secondary hover:text-foreground"
            >
              Forgot password?
            </Link>
          )}
          {mode === 'register' && (
            <Input
              label="Confirm password"
              type="password"
              placeholder="Repeat your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              error={fieldErrors.confirmPassword}
              required
            />
          )}
          {error && (
            <p role="alert" className="text-[13px] text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" fullWidth isLoading={loading}>
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </Button>
        </form>
      </div>
    </div>
  )
}
