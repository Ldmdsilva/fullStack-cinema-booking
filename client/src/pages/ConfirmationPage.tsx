import * as React from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorState } from '@/components/ui/ErrorState'
import { useSocket } from '@/context/SocketContext'
import * as bookingsApi from '@/lib/api/bookings'
import { parseApiError } from '@/lib/api/errors'
import { formatPrice, formatStubDate } from '@/lib/formatters'
import type { Booking, BookingConfirmedPayload } from '@/lib/types'

// How often to poll `bookings.getByHold` while reconciling, and how long to
// keep polling before settling into the calm "still processing" state
// instead of an error — a 404 from that endpoint is EXPECTED here (it means
// the reconciliation job hasn't fulfilled the hold yet), never a failure.
const POLL_INTERVAL_MS = 4000
const POLL_TIMEOUT_MS = 120_000

/**
 * Two modes, matched on how the page was reached:
 *  - `/confirmation?hold=<holdId>` — RECONCILING: payment was confirmed
 *    client-side but the server-side `bookings.confirm` fulfillment hasn't
 *    been observed yet (e.g. the confirm call itself failed/timed out, or
 *    the tab was closed and reopened). Poll `by-hold` and listen for the
 *    `booking:confirmed` socket push; whichever resolves first wins.
 *  - `/confirmation/:bookingId` — RESOLVED: the booking exists, show it.
 */
export function ConfirmationPage() {
  const { bookingId } = useParams<{ bookingId: string }>()
  const [searchParams] = useSearchParams()
  const holdId = searchParams.get('hold')
  const navigate = useNavigate()

  if (bookingId) {
    return <ResolvedConfirmation bookingId={bookingId} />
  }

  if (holdId) {
    return <ReconcilingConfirmation holdId={holdId} />
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-24 text-center">
      <ErrorState title="Nothing to confirm" description="We couldn't find a booking or reservation to show here." />
      <Button className="mt-6" onClick={() => navigate('/films')}>
        Back to browsing
      </Button>
    </div>
  )
}

function ResolvedConfirmation({ bookingId }: { bookingId: string }) {
  const navigate = useNavigate()
  const [status, setStatus] = React.useState<'loading' | 'error' | 'success'>('loading')
  const [booking, setBooking] = React.useState<Booking | null>(null)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)

  const load = React.useCallback(() => {
    setStatus('loading')
    bookingsApi
      .getById(bookingId)
      .then(({ booking: b }) => {
        setBooking(b)
        setStatus('success')
      })
      .catch((err) => {
        setErrorMessage(parseApiError(err).message)
        setStatus('error')
      })
  }, [bookingId])

  React.useEffect(() => {
    load()
  }, [load])

  if (status === 'loading') {
    return <Spinner label="Loading your booking…" className="py-32" />
  }

  if (status === 'error' || !booking) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-24 text-center">
        <h1 className="font-voice text-[32px] font-medium">Booking not found</h1>
        {errorMessage && <ErrorState description={errorMessage} onRetry={load} className="mt-4" />}
        <Button className="mt-6" onClick={() => navigate('/bookings')}>
          View my bookings
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-12">
      <div className="mb-8 text-center">
        <span className="inline-flex size-12 items-center justify-center rounded-full bg-[var(--status-confirmed-bg)] text-[var(--status-confirmed-fg)]">
          <CheckCircle2 className="size-6" />
        </span>
        <h1 className="mt-4 font-voice text-[36px] font-medium tracking-[-0.02em]">You're going.</h1>
        <p className="mt-2 text-text-secondary">
          Booking <span className="font-mono text-foreground">{booking.reference}</span> is confirmed. Keep this
          stub — it's your ticket.
        </p>
      </div>

      <div className="rounded-[var(--radius-card)] border-[0.5px] border-border bg-card p-6">
        {booking.showtime && (
          <p className="font-mono text-[12px] uppercase tracking-[0.08em] text-text-muted">
            {booking.showtime.screenName} · {formatStubDate(booking.showtime.startsAt)}
          </p>
        )}
        <ul className="mt-3 flex flex-col gap-1.5">
          {booking.seats.map((s) => (
            <li key={s.id} className="flex justify-between font-mono text-[13px]">
              <span>
                {s.id} <span className="text-text-muted">· {s.section}</span>
              </span>
              <span>{formatPrice(s.price)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between border-t border-border pt-3 text-[14px] font-medium">
          <span>Total paid</span>
          <span>{formatPrice(booking.totalPrice)}</span>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Button variant="secondary" size="md" onClick={() => navigate('/bookings')}>
          View my bookings
        </Button>
      </div>
    </div>
  )
}

type ReconcileState = 'polling' | 'timed-out'

// pollIntervalMs/pollTimeoutMs default to the real production cadence — the
// params exist so tests can drive this component with short real waits
// instead of fighting fake-timer/testing-library interactions (passive
// effects and internal waitFor polling aren't reliably advanceable together).
export function ReconcilingConfirmation({
  holdId,
  pollIntervalMs = POLL_INTERVAL_MS,
  pollTimeoutMs = POLL_TIMEOUT_MS,
}: {
  holdId: string
  pollIntervalMs?: number
  pollTimeoutMs?: number
}) {
  const navigate = useNavigate()
  const { socket } = useSocket()
  const [state, setState] = React.useState<ReconcileState>('polling')

  React.useEffect(() => {
    setState('polling')
    let cancelled = false
    let resolved = false
    let timeoutId: ReturnType<typeof setTimeout>

    const resolve = (bookingId: string) => {
      if (resolved || cancelled) return
      resolved = true
      clearTimeout(timeoutId)
      // Replace history so the back button returns to the showtime/browse
      // flow, not back into the polling state.
      navigate(`/confirmation/${bookingId}`, { replace: true })
    }

    function handleBookingConfirmed(payload: BookingConfirmedPayload) {
      if (payload.holdId !== holdId) return
      resolve(payload.bookingId)
    }
    socket.on('booking:confirmed', handleBookingConfirmed)

    const startedAt = Date.now()

    async function poll() {
      if (cancelled || resolved) return
      try {
        const { booking } = await bookingsApi.getByHold(holdId)
        resolve(booking.id)
        return
      } catch {
        // A 404 here is expected — the reconciliation job hasn't fulfilled
        // this hold yet. Never treated as an error; just try again later.
      }
      if (cancelled || resolved) return
      if (Date.now() - startedAt >= pollTimeoutMs) {
        setState('timed-out')
        return
      }
      timeoutId = setTimeout(poll, pollIntervalMs)
    }

    timeoutId = setTimeout(poll, pollIntervalMs)

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
      socket.off('booking:confirmed', handleBookingConfirmed)
    }
  }, [holdId, socket, navigate, pollIntervalMs, pollTimeoutMs])

  if (state === 'timed-out') {
    return (
      <div className="mx-auto max-w-2xl px-5 py-24 text-center">
        <span className="inline-flex size-12 items-center justify-center rounded-full bg-[var(--status-confirmed-bg)] text-[var(--status-confirmed-fg)]">
          <Clock className="size-6" />
        </span>
        <h1 className="mt-4 font-voice text-[32px] font-medium tracking-[-0.02em]">Still finalising your booking</h1>
        <p className="mx-auto mt-2 max-w-md text-text-secondary">
          Your payment went through and your seats are safe — this is just taking a little longer than usual to
          finalise. Check My Bookings in a few minutes and it'll be there.
        </p>
        <Button className="mt-6" onClick={() => navigate('/bookings')}>
          Check my bookings
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-24 text-center">
      <span className="inline-flex size-12 items-center justify-center rounded-full bg-[var(--status-pending-bg)] text-[var(--status-pending-fg)]">
        <Clock className="size-6 animate-pulse" />
      </span>
      <h1 className="mt-4 font-voice text-[32px] font-medium tracking-[-0.02em]">Confirming your booking…</h1>
      <p className="mt-2 text-text-secondary">
        Your payment is being finalised. This page will update automatically — no need to refresh.
      </p>
    </div>
  )
}
