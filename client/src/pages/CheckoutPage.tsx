import * as React from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft, Lock, ShieldCheck } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorState } from '@/components/ui/ErrorState'
import { PaymentForm } from '@/components/payments/PaymentForm'
import { useAsync } from '@/hooks/useAsync'
import { useToast } from '@/components/ui/toast'
import * as holdsApi from '@/lib/api/holds'
import { parseApiError } from '@/lib/api/errors'
import { formatPrice } from '@/lib/formatters'
import type { ApiError, CreateHoldPaymentIntentResponse } from '@/lib/types'

export function CheckoutPage() {
  const { holdId } = useParams<{ holdId: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()

  const { status, data: hold, error, retry } = useAsync(
    () => (holdId ? holdsApi.getById(holdId) : Promise.reject(new Error('Missing hold id'))),
    [holdId],
  )

  const holdIsActive = status === 'success' && hold.status === 'active'

  const [intent, setIntent] = React.useState<CreateHoldPaymentIntentResponse | null>(null)
  const [intentError, setIntentError] = React.useState<ApiError | null>(null)

  // Create the PaymentIntent once the hold is confirmed live — never
  // retried automatically (a retried create could double-create against
  // the same hold), so a failure here just shows an inline error.
  React.useEffect(() => {
    if (!holdIsActive || !holdId) return
    let cancelled = false
    setIntent(null)
    setIntentError(null)

    holdsApi
      .createPaymentIntent(holdId)
      .then((response) => {
        if (!cancelled) setIntent(response)
      })
      .catch((err) => {
        if (!cancelled) setIntentError(parseApiError(err))
      })

    return () => {
      cancelled = true
    }
  }, [holdIsActive, holdId])

  const handleExpire = React.useCallback(() => {
    toast('Your seat hold expired. Please select your seats again.', 'error')
    navigate('/films', { replace: true })
  }, [toast, navigate])

  if (status === 'loading') {
    return <Spinner label="Loading your reservation…" className="py-32" />
  }

  if (status === 'error') {
    const isGone = error.code === 'HOLD_NOT_FOUND' || error.code === 'HOLD_EXPIRED'
    return (
      <div className="mx-auto max-w-3xl px-5 py-24 text-center">
        <ErrorState
          title={isGone ? 'This reservation is no longer available' : undefined}
          description={error.message}
          onRetry={isGone ? undefined : retry}
        />
        <Link
          to="/films"
          className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-medium underline underline-offset-2"
        >
          <ArrowLeft className="size-4" /> Back to browsing
        </Link>
      </div>
    )
  }

  if (!holdId || !hold) return null

  if (hold.status !== 'active') {
    return (
      <div className="mx-auto max-w-3xl px-5 py-24 text-center">
        <ErrorState
          title="This reservation is no longer available"
          description="Your seat hold has expired, or it's already been used. Please select your seats again."
        />
        <Link
          to="/films"
          className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-medium underline underline-offset-2"
        >
          <ArrowLeft className="size-4" /> Back to browsing
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <Link
        to="/films"
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-text-secondary hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to browsing
      </Link>

      <h1 className="font-voice text-[36px] font-medium tracking-[-0.02em]">Checkout</h1>
      <p className="mt-1 text-text-secondary">Review your seats and confirm.</p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
        {/* Payment */}
        <div className="order-2 lg:order-1">
          <div className="rounded-[var(--radius-card)] border-[0.5px] border-border bg-card p-6">
            <h2 className="flex items-center gap-2 text-[20px] font-medium">
              <Lock className="size-4 text-text-muted" /> Payment
            </h2>

            <div className="mt-4 flex items-start gap-2 rounded-[var(--radius)] bg-[var(--status-confirmed-bg)] px-3 py-2.5 text-[13px] text-[var(--status-confirmed-fg)]">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              <p>
                Test mode — Stripe processes this payment. Use card{' '}
                <span className="font-mono">4242 4242 4242 4242</span>.
              </p>
            </div>

            {intentError && (
              <p role="alert" className="mt-4 text-[13px] text-destructive">
                {intentError.message}
              </p>
            )}

            {!intent && !intentError && <Spinner label="Preparing payment…" className="py-8" />}

            {intent && (
              <PaymentForm
                holdId={holdId}
                clientSecret={intent.clientSecret}
                publishableKey={intent.publishableKey}
                expiresAt={intent.expiresAt}
                onExpire={handleExpire}
              />
            )}
          </div>
        </div>

        {/* Summary */}
        <aside className="order-1 lg:order-2">
          <div className="rounded-[var(--radius-card)] border-[0.5px] border-border bg-card p-4">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">Seats</p>
            <ul className="flex flex-col gap-1.5">
              {hold.seatSnapshot.map((s) => (
                <li key={s.id} className="flex justify-between font-mono text-[13px]">
                  <span>
                    {s.id} <span className="text-text-muted">· {s.section}</span>
                  </span>
                  <span>{formatPrice(s.price)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-between border-t border-border pt-3 text-[14px] font-medium">
              <span>Total</span>
              <span>{formatPrice(hold.totalPrice)}</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
