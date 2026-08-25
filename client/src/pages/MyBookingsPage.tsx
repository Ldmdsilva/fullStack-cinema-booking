import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TicketStub } from '@/components/TicketStub'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorState } from '@/components/ui/ErrorState'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/toast'
import { useAsync } from '@/hooks/useAsync'
import * as bookingsApi from '@/lib/api/bookings'
import { parseApiError } from '@/lib/api/errors'
import { formatEventDate, formatPrice, formatStubDate } from '@/lib/formatters'
import type { Booking, BookingStatus } from '@/lib/types'

const PAGE_SIZE = 10

const STATUS_LABEL: Record<BookingStatus, string> = {
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
}

const STATUS_VARIANT: Record<BookingStatus, 'confirmed' | 'cancelled'> = {
  confirmed: 'confirmed',
  cancelled: 'cancelled',
}

export function MyBookingsPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [page, setPage] = React.useState(1)
  const [cancelTarget, setCancelTarget] = React.useState<Booking | null>(null)
  const [cancelling, setCancelling] = React.useState(false)

  const { status, data, error, retry } = useAsync(
    () => bookingsApi.listMine({ page, limit: PAGE_SIZE }),
    [page],
    { isEmpty: (d) => d.items.length === 0 },
  )

  const closeModal = () => {
    if (cancelling) return
    setCancelTarget(null)
  }

  const confirmCancel = async () => {
    if (!cancelTarget) return
    setCancelling(true)
    try {
      await bookingsApi.cancel(cancelTarget.id)
      toast('Booking cancelled.', 'success')
      setCancelTarget(null)
      retry()
    } catch (err) {
      toast(parseApiError(err).message, 'error')
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <h1 className="font-voice text-[36px] font-medium tracking-[-0.02em]">My tickets</h1>
      <p className="mt-1 text-text-secondary">
        Every stub you've booked, newest first.
      </p>

      {status === 'loading' && <Spinner label="Loading your tickets…" className="mt-10" />}

      {status === 'error' && (
        <ErrorState description={error.message} onRetry={retry} className="mt-10" />
      )}

      {status === 'empty' && (
        <div className="mt-10 rounded-[var(--radius-card)] border-[0.5px] border-dashed border-border-strong px-6 py-16 text-center">
          <h2 className="font-voice text-[24px] font-medium">
            You haven't booked any concerts yet
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-[15px] text-text-secondary">
            When you book a show, your ticket stub appears here.
          </p>
          <Button className="mt-6" onClick={() => navigate('/events')}>
            Browse concerts
          </Button>
        </div>
      )}

      {status === 'success' && (
        <>
          <ul className="mt-8 flex flex-col gap-5">
            {data.items.map((b) => {
              const isRefunded = b.status === 'cancelled' && b.paymentStatus === 'refunded'
              return (
                <li key={b.id}>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[13px] text-text-muted">
                      {b.showtime ? formatEventDate(b.showtime.startsAt) : 'Showtime unavailable'}
                      {b.showtime ? ` · ${b.showtime.screenName}` : ''} · {b.seats.length}{' '}
                      {b.seats.length === 1 ? 'seat' : 'seats'} ·{' '}
                      {formatPrice(b.totalPrice)}
                    </p>
                    {isRefunded ? (
                      <Badge variant="refunded">Refunded</Badge>
                    ) : (
                      <Badge variant={STATUS_VARIANT[b.status]}>{STATUS_LABEL[b.status]}</Badge>
                    )}
                  </div>
                  <TicketStub
                    variant="compact"
                    eyebrow={b.showtime ? formatStubDate(b.showtime.startsAt) : ''}
                    title={b.showtime?.screenName ?? 'Showtime'}
                    subtitle=""
                    serial={b.reference}
                    onClick={() => navigate(`/confirmation/${b.id}`)}
                  />
                  {b.status === 'confirmed' && (
                    <div className="mt-2 flex justify-end">
                      <Button variant="ghost" size="sm" onClick={() => setCancelTarget(b)}>
                        Cancel booking
                      </Button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>

          {data.totalPages > 1 && (
            <div className="mt-10 flex items-center justify-center gap-4">
              <Button
                variant="secondary"
                size="sm"
                disabled={data.page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="size-4" />
                Previous
              </Button>
              <span className="font-mono text-[13px] text-text-muted">
                Page {data.page} of {data.totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={data.page >= data.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
                <ChevronRight className="size-4" />
              </Button>
            </div>
          )}
        </>
      )}

      <Modal
        open={cancelTarget !== null}
        onClose={closeModal}
        title="Cancel this booking?"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={closeModal} disabled={cancelling}>
              Keep it
            </Button>
            <Button variant="danger" size="sm" onClick={confirmCancel} isLoading={cancelling}>
              Yes, cancel
            </Button>
          </>
        }
      >
        {cancelTarget && (
          <p>
            Booking <span className="font-mono text-foreground">{cancelTarget.reference}</span> for{' '}
            {formatPrice(cancelTarget.totalPrice)} will be cancelled
            {cancelTarget.status === 'confirmed' ? ' and refunded' : ''}. This cannot be undone.
          </p>
        )}
      </Modal>
    </div>
  )
}
