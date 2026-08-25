import * as React from 'react'
import { loadStripe, type Appearance, type Stripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { HoldCountdown } from './HoldCountdown'
import * as bookingsApi from '@/lib/api/bookings'
import { parseApiError } from '@/lib/api/errors'

// Built from the ticket-stub design tokens in src/index.css so the Payment
// Element doesn't look bolted on (Phase 6, carried over unchanged into
// ADR-014 — none of these token names/values moved during the cinema
// migration).
const appearance: Appearance = {
  theme: 'stripe',
  variables: {
    colorPrimary: '#c8102e', // --stamp-red
    colorBackground: '#ffffff', // --surface
    colorText: '#1a1714', // --ink / --text-primary
    colorTextSecondary: '#55504a', // --text-secondary
    colorDanger: '#a32d2d', // --status-cancelled-fg
    fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
    borderRadius: '8px', // --radius
    spacingUnit: '4px',
  },
}

// One Stripe.js instance per publishable key for the app's lifetime —
// `loadStripe` injects a <script> tag and must never be called more than
// once for the same key (a fresh CheckoutPage mount reuses this instead of
// re-injecting Stripe.js on every remount).
let cachedPromise: Promise<Stripe | null> | null = null
let cachedKey: string | null = null

function getStripe(publishableKey: string): Promise<Stripe | null> {
  if (!cachedPromise || cachedKey !== publishableKey) {
    cachedKey = publishableKey
    cachedPromise = loadStripe(publishableKey)
  }
  return cachedPromise
}

export interface PaymentFormProps {
  holdId: string
  clientSecret: string
  publishableKey: string | null
  expiresAt: string
  /** Fired once the hold's countdown reaches zero — the parent decides
   * what that means (e.g. navigate back to the showtime with a toast). */
  onExpire?: () => void
}

/**
 * ADR-014: a plain Elements + PaymentElement flow against a Stripe
 * PaymentIntent (holdsApi.createPaymentIntent), NOT the embedded Checkout
 * Sessions API this replaced. `stripe.confirmPayment` is called with
 * `redirect: 'if_required'` so the element stays inline for cards; once
 * Stripe itself reports success, the client still doesn't trust that
 * reading as final — it asks the server to confirm the booking
 * (bookingsApi.confirm), which re-derives the truth directly from Stripe.
 */
export function PaymentForm({ holdId, clientSecret, publishableKey, expiresAt, onExpire }: PaymentFormProps) {
  if (!publishableKey) {
    return (
      <p role="alert" className="mt-4 text-[13px] text-destructive">
        Payment is currently unavailable. Please try again shortly.
      </p>
    )
  }

  return (
    <Elements stripe={getStripe(publishableKey)} options={{ clientSecret, appearance }}>
      <PaymentFormInner holdId={holdId} expiresAt={expiresAt} onExpire={onExpire} />
    </Elements>
  )
}

function PaymentFormInner({ holdId, expiresAt, onExpire }: Omit<PaymentFormProps, 'clientSecret' | 'publishableKey'>) {
  const stripe = useStripe()
  const elements = useElements()
  const navigate = useNavigate()
  const [submitting, setSubmitting] = React.useState(false)
  const [expired, setExpired] = React.useState(false)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
  // Populated only when Stripe itself succeeded but the server-side
  // `bookings.confirm` step failed transiently — retrying that call alone
  // (never re-running confirmPayment) is always safe, per ADR-014.
  const [retryHoldId, setRetryHoldId] = React.useState<string | null>(null)

  const confirmBooking = async (id: string) => {
    try {
      const { booking } = await bookingsApi.confirm({ holdId: id })
      navigate(`/confirmation/${booking.id}`)
    } catch (err) {
      const apiError = parseApiError(err)
      setErrorMessage(apiError.message)
      if (apiError.code === 'PAYMENT_NOT_SUCCEEDED' || apiError.code === 'PAYMENT_PROVIDER_UNAVAILABLE') {
        setRetryHoldId(id)
      } else {
        setRetryHoldId(null)
      }
    }
  }

  const handleExpire = () => {
    setExpired(true)
    onExpire?.()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setErrorMessage(null)
    setRetryHoldId(null)
    setSubmitting(true)

    try {
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: `${window.location.origin}/confirmation?hold=${holdId}` },
        redirect: 'if_required',
      })

      if (result.error) {
        // Declined/incomplete — the hold is still live, let the user retry.
        setErrorMessage(result.error.message ?? 'Your payment could not be completed. Please try again.')
        return
      }

      const status = result.paymentIntent?.status
      if (status === 'succeeded' || status === 'processing') {
        await confirmBooking(holdId)
      } else {
        setErrorMessage('Your payment was not completed. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleRetryConfirm = async () => {
    if (!retryHoldId) return
    setSubmitting(true)
    setErrorMessage(null)
    try {
      await confirmBooking(retryHoldId)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6">
      <HoldCountdown expiresAt={expiresAt} onExpire={handleExpire} className="mb-3" />

      <PaymentElement />

      {errorMessage && (
        <div role="alert" className="mt-3 text-[13px] text-destructive">
          <p>{errorMessage}</p>
          {retryHoldId && (
            <button
              type="button"
              onClick={handleRetryConfirm}
              className="mt-1 font-medium underline underline-offset-2"
            >
              Try confirming again
            </button>
          )}
        </div>
      )}

      <Button
        type="submit"
        size="lg"
        fullWidth
        className="mt-4"
        isLoading={submitting}
        disabled={expired || !stripe || Boolean(retryHoldId)}
      >
        {submitting ? 'Processing payment…' : 'Pay now'}
      </Button>
    </form>
  )
}
