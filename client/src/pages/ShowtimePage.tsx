import * as React from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft, Radio, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SeatMap } from '@/components/seats/SeatMap'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorState } from '@/components/ui/ErrorState'
import { EmptyState } from '@/components/ui/EmptyState'
import { useShowtimeSeats, MAX_SEATS } from '@/hooks/useShowtimeSeats'
import * as holdsApi from '@/lib/api/holds'
import * as authApi from '@/lib/api/auth'
import { parseApiError } from '@/lib/api/errors'
import { formatPrice, formatEventDate } from '@/lib/formatters'
import { SEAT_TIERS, TIER_LABELS, TIER_MULTIPLIERS } from '@/lib/tiers'
import type { ApiError } from '@/lib/types'

// Seat selection for one specific showtime — fetch, live seat sync, and the
// hand-off into a seat hold. Browsing (film → showtime picker) happens one
// screen up on FilmDetailPage; this page never creates a hold until
// "Continue" is pressed.
export function ShowtimePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [liveMessage, setLiveMessage] = React.useState('')
  const [holdError, setHoldError] = React.useState<ApiError | null>(null)
  const [needsVerification, setNeedsVerification] = React.useState(false)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [resendState, setResendState] = React.useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  const { showtime, seats, selectedIds, status, error, cancelled, isConnected, toggleSeat, retry, resync } =
    useShowtimeSeats(id)

  if (status === 'loading') {
    return <Spinner label="Loading showtime…" className="py-32" />
  }

  if (status === 'error' || !showtime) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-24 text-center">
        <ErrorState
          title="Showtime not found"
          description={error?.message ?? 'This showtime may have finished or the link is wrong.'}
          onRetry={id ? retry : undefined}
        />
        <Button className="mt-2" onClick={() => navigate('/films')}>
          Browse films
        </Button>
      </div>
    )
  }

  if (cancelled) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-24">
        <EmptyState
          title="This showtime was cancelled"
          description="Sorry about that — please pick a different showtime for this film."
          action={
            <Button className="mt-2" onClick={() => navigate(showtime.film ? `/films/${showtime.film.id}` : '/films')}>
              Back to film
            </Button>
          }
        />
      </div>
    )
  }

  const toggle = (seatId: string) => {
    const wasSelected = selectedIds.includes(seatId)
    toggleSeat(seatId)
    setLiveMessage(wasSelected ? `Seat ${seatId} removed` : `Seat ${seatId} selected`)
  }

  const selectedSeats = seats.filter((s) => selectedIds.includes(s.id))
  const total = selectedSeats.reduce((sum, s) => sum + s.price, 0)

  const tierPrices = SEAT_TIERS.map((tier) => ({
    tier,
    label: TIER_LABELS[tier],
    price: Math.round(showtime.basePrice * TIER_MULTIPLIERS[tier]),
  }))

  const onContinue = async () => {
    if (!id || selectedSeats.length === 0) return
    setIsSubmitting(true)
    setHoldError(null)
    try {
      const hold = await holdsApi.create({ showtimeId: id, seatIds: selectedIds })
      navigate(`/checkout/${hold.holdId}`)
    } catch (err) {
      const apiError = parseApiError(err)
      if (apiError.code === 'EMAIL_NOT_VERIFIED') {
        setNeedsVerification(true)
      } else if (apiError.code === 'SEAT_UNAVAILABLE') {
        setHoldError(apiError)
        resync()
      } else {
        setHoldError(apiError)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const onResend = async () => {
    setResendState('sending')
    try {
      await authApi.resendVerification()
      setResendState('sent')
    } catch {
      setResendState('error')
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <Link
        to={showtime.film ? `/films/${showtime.film.id}` : '/films'}
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-text-secondary hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to film
      </Link>

      {/* Header */}
      <header className="mb-8 grid gap-6 md:grid-cols-[1.4fr_1fr] md:items-end">
        <div className="flex items-start gap-4">
          {showtime.film?.posterUrl && (
            <img
              src={showtime.film.posterUrl}
              alt=""
              className="h-24 w-16 shrink-0 rounded-[var(--radius)] object-cover"
              loading="lazy"
            />
          )}
          <div>
            <p className="eyebrow text-stamp-red">{showtime.screenName}</p>
            <h1 className="mt-2 font-voice text-[36px] font-medium leading-[1.02] tracking-[-0.02em] sm:text-[44px]">
              {showtime.film?.title ?? 'Showtime'}
            </h1>
            <p className="mt-1 text-[15px] text-text-secondary">
              {showtime.cinema?.name}
              {showtime.cinema?.city ? ` · ${showtime.cinema.city}` : ''}
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-[var(--radius-card)] border-[0.5px] border-border bg-card p-5">
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">Starts</dt>
            <dd className="mt-1 font-mono text-[14px]">{formatEventDate(showtime.startsAt)}</dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">From</dt>
            <dd className="mt-1 font-mono text-[15px]">{formatPrice(showtime.basePrice)}</dd>
          </div>
          <div className="col-span-2">
            <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">Connection</dt>
            <dd className="mt-1 flex items-center gap-1.5 text-[13px]">
              <Radio className={isConnected ? 'size-3.5 text-seat-free' : 'size-3.5 text-ash'} />
              <span className={isConnected ? 'text-seat-free' : 'text-ash'}>
                {isConnected ? 'Live' : 'Connecting…'}
              </span>
            </dd>
          </div>
        </dl>
      </header>

      {/* Tier price summary */}
      <div className="mb-6 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-text-secondary">
        {tierPrices.map((t) => (
          <span key={t.tier}>
            {t.label} <span className="font-mono text-foreground">{formatPrice(t.price)}</span>
          </span>
        ))}
      </div>

      {/* Seat map + summary */}
      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="rounded-[var(--radius-card)] border-[0.5px] border-border bg-card p-5 sm:p-8">
          <SeatMap seats={seats} selectedIds={selectedIds} onToggle={toggle} liveMessage={liveMessage} />
        </div>

        {/* Selection summary */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-[var(--radius-card)] border-[0.5px] border-border bg-card p-5">
            <h2 className="text-[18px] font-medium">Your selection</h2>
            {selectedSeats.length === 0 ? (
              <p className="mt-3 text-[14px] leading-relaxed text-text-secondary">
                Tap an available seat to add it. You can pick up to {MAX_SEATS}.
              </p>
            ) : (
              <ul className="mt-4 flex flex-col gap-2">
                {selectedSeats.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between rounded-[var(--radius)] bg-surface-sunk px-3 py-2"
                  >
                    <span className="font-mono text-[13px]">
                      {s.id} <span className="text-text-muted">· {s.section}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-[13px]">{formatPrice(s.price)}</span>
                      <button
                        onClick={() => toggle(s.id)}
                        aria-label={`Remove seat ${s.id}`}
                        className="text-text-muted hover:text-destructive"
                      >
                        <X className="size-4" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-5 flex items-baseline justify-between border-t-[0.5px] border-border pt-4">
              <span className="text-[14px] text-text-secondary">Total</span>
              <span className="font-mono text-[20px]">{formatPrice(total)}</span>
            </div>
            {/* Shown for reference only — the server recomputes the total. */}
            <p className="mt-1 text-[11px] text-text-muted">Final total confirmed at checkout.</p>

            {needsVerification && (
              <div
                role="alert"
                className="mt-4 rounded-[var(--radius)] border-[0.5px] border-destructive/40 bg-[var(--status-cancelled-bg)] p-3"
              >
                <p className="text-[13px] text-destructive">
                  Please verify your email address before you can hold seats.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-2"
                  onClick={onResend}
                  disabled={resendState === 'sending' || resendState === 'sent'}
                >
                  {resendState === 'sent' ? 'Verification email sent' : 'Resend verification email'}
                </Button>
                {resendState === 'error' && (
                  <p className="mt-2 text-[12px] text-destructive">
                    Could not resend the email. Please try again shortly.
                  </p>
                )}
              </div>
            )}

            {holdError && !needsVerification && (
              <p role="alert" className="mt-4 text-[13px] text-destructive">
                {holdError.message}
              </p>
            )}

            <Button
              fullWidth
              size="lg"
              className="mt-4"
              disabled={selectedSeats.length === 0 || isSubmitting}
              isLoading={isSubmitting}
              onClick={onContinue}
            >
              Continue
            </Button>
          </div>
        </aside>
      </div>
    </div>
  )
}
