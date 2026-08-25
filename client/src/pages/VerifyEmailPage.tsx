import * as React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/Spinner'
import { useAuth } from '@/context/AuthContext'
import * as authApi from '@/lib/api/auth'
import { parseApiError } from '@/lib/api/errors'
import type { ApiError } from '@/lib/types'

type VerifyState = { status: 'loading' } | { status: 'success' } | { status: 'error'; error: ApiError }

// A 400 TOKEN_EXPIRED/TOKEN_NOT_FOUND/TOKEN_USED here does NOT trigger the
// global logout/redirect (client.ts's response interceptor keys that off
// `status === 401`, not the error `code` — this endpoint's failure modes are
// always 400s) — so it's safe to render our own inline error state below.
export function VerifyEmailPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const { status: authStatus } = useAuth()

  const [state, setState] = React.useState<VerifyState>({ status: 'loading' })
  const [resendState, setResendState] = React.useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  React.useEffect(() => {
    let cancelled = false

    if (!token) {
      setState({
        status: 'error',
        error: { code: 'TOKEN_NOT_FOUND', message: 'This verification link is missing its token.' },
      })
      return
    }

    authApi
      .verifyEmail({ token })
      .then(() => {
        if (!cancelled) setState({ status: 'success' })
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ status: 'error', error: parseApiError(err) })
      })

    return () => {
      cancelled = true
    }
  }, [token])

  const resend = async () => {
    setResendState('sending')
    try {
      await authApi.resendVerification()
      setResendState('sent')
    } catch {
      setResendState('error')
    }
  }

  const errorMessage = (error: ApiError) => {
    if (error.code === 'TOKEN_USED') {
      return 'This verification link has already been used. If your email is already verified, you can sign in now.'
    }
    return 'This verification link is no longer valid. It may have expired or been superseded by a newer one.'
  }

  return (
    <div className="mx-auto flex max-w-md flex-col px-5 py-16 text-center">
      <p className="eyebrow text-stamp-red">Your account</p>
      <h1 className="mt-3 font-voice text-[36px] font-medium tracking-[-0.02em]">Verify your email</h1>

      <div className="mt-8 rounded-[var(--radius-card)] border-[0.5px] border-border bg-card p-6">
        {state.status === 'loading' && <Spinner label="Verifying your email…" />}

        {state.status === 'success' && (
          <>
            <p className="text-[15px] text-text-secondary">Your email is verified — you can now book tickets.</p>
            <Button
              className="mt-6"
              size="lg"
              fullWidth
              onClick={() => navigate(authStatus === 'authenticated' ? '/films' : '/login')}
            >
              {authStatus === 'authenticated' ? 'Browse films' : 'Sign in'}
            </Button>
          </>
        )}

        {state.status === 'error' && (
          <>
            <p role="alert" className="text-[15px] text-destructive">
              {errorMessage(state.error)}
            </p>

            {authStatus === 'authenticated' ? (
              <>
                <Button
                  className="mt-6"
                  size="lg"
                  fullWidth
                  onClick={resend}
                  isLoading={resendState === 'sending'}
                  disabled={resendState === 'sent'}
                >
                  {resendState === 'sent' ? 'Verification email sent' : 'Resend verification email'}
                </Button>
                {resendState === 'error' && (
                  <p role="alert" className="mt-2 text-[13px] text-destructive">
                    Could not resend the verification email. Please try again shortly.
                  </p>
                )}
              </>
            ) : (
              // Resend requires an authenticated caller (no email is sent in
              // the request body) — an anonymous visitor has to sign in
              // first before they can ask for a new link.
              <Button className="mt-6" size="lg" fullWidth onClick={() => navigate('/login')}>
                Go to sign in
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
