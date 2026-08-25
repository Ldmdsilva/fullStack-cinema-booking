import * as React from 'react'
import { cn } from '@/lib/utils'

export interface HoldCountdownProps {
  /** ISO timestamp the hold (or its PaymentIntent) expires at. */
  expiresAt: string
  /** Fired exactly once, the instant the countdown reaches zero. The
   * caller decides what "expired" means (navigate away, disable a form,
   * show a toast, ...) — this component only renders the ticking display. */
  onExpire?: () => void
  className?: string
}

function secondsUntil(expiresAt: string): number {
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000))
}

/**
 * A ticking mm:ss countdown to `expiresAt`. Standalone and reusable — the
 * old inline `useHoldCountdownSeconds` hook lived inside the Stripe form;
 * pulling it out here lets CheckoutPage/PaymentForm both render (or just
 * rely on) the same ticking display instead of duplicating the interval.
 */
export function HoldCountdown({ expiresAt, onExpire, className }: HoldCountdownProps) {
  const [secondsLeft, setSecondsLeft] = React.useState(() => secondsUntil(expiresAt))
  const hasExpiredRef = React.useRef(false)
  const onExpireRef = React.useRef(onExpire)
  onExpireRef.current = onExpire

  // Reset the "already fired" guard whenever the target itself changes
  // (e.g. a fresh PaymentIntent with a later expiry replaces this one).
  React.useEffect(() => {
    hasExpiredRef.current = false
    setSecondsLeft(secondsUntil(expiresAt))
    const interval = setInterval(() => {
      setSecondsLeft(secondsUntil(expiresAt))
    }, 1000)
    return () => clearInterval(interval)
  }, [expiresAt])

  React.useEffect(() => {
    if (secondsLeft === 0 && !hasExpiredRef.current) {
      hasExpiredRef.current = true
      onExpireRef.current?.()
    }
  }, [secondsLeft])

  const minutes = Math.floor(secondsLeft / 60)
  const seconds = secondsLeft % 60

  return (
    <div className={cn('flex items-center justify-between text-[12px] text-text-secondary', className)}>
      <span>Complete payment before your hold expires</span>
      <span className="font-mono text-stamp-red" aria-live="off">
        {minutes}:{String(seconds).padStart(2, '0')}
      </span>
    </div>
  )
}
