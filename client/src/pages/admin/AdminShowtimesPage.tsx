import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, XCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import * as adminApi from '@/lib/api/admin'
import * as showtimesApi from '@/lib/api/showtimes'
import { formatPrice, formatEventDate } from '@/lib/formatters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorState } from '@/components/ui/ErrorState'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/toast'
import { useAsync } from '@/hooks/useAsync'
import { parseApiError } from '@/lib/api/errors'
import { cn } from '@/lib/utils'
import type { AdminShowtime } from '@/lib/types'

const PAGE_SIZE = 20

export function AdminShowtimesPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [page, setPage] = React.useState(1)
  const [search, setSearch] = React.useState('')
  const [cancelTarget, setCancelTarget] = React.useState<AdminShowtime | null>(null)
  const [cancelling, setCancelling] = React.useState(false)

  const { status, data, error, retry } = useAsync(() => adminApi.listShowtimes({ page, limit: PAGE_SIZE }), [page], {
    isEmpty: (d) => d.items.length === 0,
  })

  const showtimes = status === 'success' || status === 'empty' ? data.items : []
  const filtered = showtimes.filter((s) =>
    `${s.film?.title ?? ''} ${s.cinema?.name ?? ''} ${s.screenName}`.toLowerCase().includes(search.toLowerCase()),
  )

  const confirmCancel = async () => {
    if (!cancelTarget) return
    setCancelling(true)
    try {
      await showtimesApi.cancel(cancelTarget.id)
      toast('Showtime cancelled.', 'success')
      setCancelTarget(null)
      retry()
    } catch (err) {
      toast(parseApiError(err).message, 'error')
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex items-end justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-text-muted">
            Manage
          </p>
          <h1 className="mt-1 font-voice text-[36px] font-medium leading-tight tracking-[-0.02em]">
            Showtimes
          </h1>
        </div>
        <Button onClick={() => navigate('/admin/showtimes/new')} size="sm">
          <Plus className="size-4" />
          New showtime
        </Button>
      </div>

      {/* Search */}
      <div className="mb-5 relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-[34px] size-4 text-text-muted" />
        <Input
          label="Search showtimes"
          placeholder="Film, cinema, screen…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {status === 'loading' && <Spinner label="Loading showtimes…" />}
      {status === 'error' && <ErrorState description={error.message} onRetry={retry} />}
      {status === 'empty' && <EmptyState title="No showtimes yet" description="Create your first showtime above." />}

      {status === 'success' && (
        <>
          {/* Table */}
          <div className="rounded-[var(--radius-card)] border-[0.5px] border-border bg-card shadow-[var(--shadow-card)] overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b-[0.5px] border-border bg-surface-sunk">
                  <th className="px-4 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-text-muted">
                    Showtime
                  </th>
                  <th className="hidden px-4 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-text-muted md:table-cell">
                    Starts
                  </th>
                  <th className="hidden px-4 py-3 text-right font-mono text-[11px] uppercase tracking-wider text-text-muted lg:table-cell">
                    Revenue
                  </th>
                  <th className="px-4 py-3 text-right font-mono text-[11px] uppercase tracking-wider text-text-muted">
                    Seats
                  </th>
                  <th className="px-4 py-3 text-center font-mono text-[11px] uppercase tracking-wider text-text-muted">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right font-mono text-[11px] uppercase tracking-wider text-text-muted">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-text-muted">
                      No showtimes match "{search}"
                    </td>
                  </tr>
                ) : (
                  filtered.map((s, i) => {
                    const booked = s.totalSeats - s.availableSeats
                    const pct = s.totalSeats > 0 ? Math.round((booked / s.totalSeats) * 100) : 0
                    return (
                      <tr
                        key={s.id}
                        className={cn(
                          'transition-colors hover:bg-surface-sunk/40',
                          i < filtered.length - 1 && 'border-b-[0.5px] border-border',
                        )}
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium leading-tight">{s.film?.title ?? '—'}</p>
                          <p className="mt-0.5 text-[11px] text-text-muted">
                            {s.cinema?.name} · {s.screenName}
                          </p>
                        </td>
                        <td className="hidden px-4 py-3 text-text-secondary md:table-cell">
                          {formatEventDate(s.startsAt)}
                        </td>
                        <td className="hidden px-4 py-3 text-right font-mono lg:table-cell">
                          {formatPrice(s.revenue)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <p className="font-mono text-[12px]">
                            {booked}/{s.totalSeats}
                          </p>
                          <div className="mt-1 ml-auto h-1 w-16 overflow-hidden rounded-full bg-surface-sunk">
                            <div
                              className="h-full rounded-full bg-seat-free"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={s.status === 'scheduled' ? 'confirmed' : 'cancelled'}>
                            {s.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            {s.status === 'scheduled' && (
                              <button
                                onClick={() => setCancelTarget(s)}
                                className="flex size-8 items-center justify-center rounded-[6px] border-[0.5px] border-stamp-red/20 bg-stamp-red/5 text-stamp-red transition-colors hover:bg-stamp-red/15"
                                title="Cancel showtime"
                              >
                                <XCircle className="size-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <p className="font-mono text-[12px] text-text-muted">
              {filtered.length} {filtered.length === 1 ? 'showtime' : 'showtimes'} on this page
            </p>
            {status === 'success' && data.totalPages > 1 && (
              <div className="flex items-center gap-3">
                <Button variant="secondary" size="sm" disabled={data.page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="font-mono text-[12px] text-text-muted">
                  Page {data.page} of {data.totalPages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={data.page >= data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            )}
          </div>
        </>
      )}

      <Modal
        open={cancelTarget !== null}
        onClose={() => !cancelling && setCancelTarget(null)}
        title="Cancel this showtime?"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setCancelTarget(null)} disabled={cancelling}>
              Keep showtime
            </Button>
            <Button variant="danger" size="sm" onClick={confirmCancel} isLoading={cancelling}>
              Cancel showtime
            </Button>
          </>
        }
      >
        {cancelTarget && (
          <p>
            <span className="font-medium text-foreground">{cancelTarget.film?.title ?? cancelTarget.screenName}</span> will be
            cancelled. Confirmed bookings against it are refunded and their customers notified.
            This cannot be undone.
          </p>
        )}
      </Modal>
    </div>
  )
}
