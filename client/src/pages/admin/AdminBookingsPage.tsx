import * as React from 'react'
import { Search, X, ChevronLeft, ChevronRight } from 'lucide-react'
import * as bookingsApi from '@/lib/api/bookings'
import * as adminApi from '@/lib/api/admin'
import { formatPrice, formatEventDate } from '@/lib/formatters'
import { Input, Select } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorState } from '@/components/ui/ErrorState'
import { EmptyState } from '@/components/ui/EmptyState'
import { useAsync } from '@/hooks/useAsync'
import { cn } from '@/lib/utils'
import type { Booking } from '@/lib/types'

type StatusFilter = 'all' | 'confirmed' | 'cancelled' | 'refunded'
const PAGE_SIZE = 20

function statusVariant(b: Booking): 'confirmed' | 'cancelled' | 'refunded' {
  if (b.status === 'cancelled' && b.paymentStatus === 'refunded') return 'refunded'
  return b.status
}

function statusLabel(b: Booking): string {
  return statusVariant(b) === 'refunded' ? 'refunded' : b.status
}

export function AdminBookingsPage() {
  const [page, setPage] = React.useState(1)
  const [search, setSearch] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all')
  const [showtimeFilter, setShowtimeFilter] = React.useState('')

  // Showtime list for the filter dropdown — admin scope, so it includes
  // cancelled/past showtimes too (adminApi.listShowtimes), not the public list.
  const { status: showtimesStatus, data: showtimesData } = useAsync(() => adminApi.listShowtimes({ limit: 100 }), [])
  const showtimes = showtimesStatus === 'success' || showtimesStatus === 'empty' ? showtimesData.items : []

  const { status, data, error, retry } = useAsync(
    () => bookingsApi.listAll({ showtimeId: showtimeFilter || undefined, page, limit: PAGE_SIZE }),
    [page, showtimeFilter],
    { isEmpty: (d) => d.items.length === 0 },
  )

  const bookings = status === 'success' || status === 'empty' ? data.items : []

  const filtered = bookings.filter((b) => {
    const matchStatus = statusFilter === 'all' || statusVariant(b) === statusFilter
    const matchSearch =
      !search ||
      `${b.user?.name ?? ''} ${b.user?.email ?? ''} ${b.reference} ${b.showtime?.screenName ?? ''}`
        .toLowerCase()
        .includes(search.toLowerCase())
    return matchStatus && matchSearch
  })

  const totalRevenue = filtered
    .filter((b) => b.status === 'confirmed')
    .reduce((s, b) => s + b.totalPrice, 0)

  const hasFilters = search || statusFilter !== 'all' || showtimeFilter

  const changeShowtimeFilter = (value: string) => {
    setShowtimeFilter(value)
    setPage(1)
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      {/* Header */}
      <div className="mb-6">
        <p className="font-mono text-[11px] uppercase tracking-widest text-text-muted">
          Manage
        </p>
        <h1 className="mt-1 font-voice text-[36px] font-medium leading-tight tracking-[-0.02em]">
          Bookings
        </h1>
      </div>

      {/* Filter row */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-[34px] size-4 text-text-muted" />
          <Input
            label="Search (this page)"
            placeholder="Customer name, ref, screen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          label="Showtime"
          value={showtimeFilter}
          onChange={(e) => changeShowtimeFilter(e.target.value)}
          className="w-56"
        >
          <option value="">All showtimes</option>
          {showtimes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.film?.title ?? s.screenName} · {formatEventDate(s.startsAt).split(',')[0]}
            </option>
          ))}
        </Select>
        <Select
          label="Status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="w-40"
        >
          <option value="all">All statuses</option>
          <option value="confirmed">Confirmed</option>
          <option value="cancelled">Cancelled</option>
          <option value="refunded">Refunded</option>
        </Select>
        {hasFilters && (
          <Button
            variant="ghost"
            size="md"
            onClick={() => {
              setSearch('')
              setStatusFilter('all')
              changeShowtimeFilter('')
            }}
            className="shrink-0"
          >
            <X className="size-4" />
            Clear
          </Button>
        )}
      </div>

      {status === 'loading' && <Spinner label="Loading bookings…" />}
      {status === 'error' && <ErrorState description={error.message} onRetry={retry} />}
      {status === 'empty' && <EmptyState title="No bookings yet" />}

      {status === 'success' && (
        <>
          {/* Summary bar */}
          <div className="mb-4 flex items-center gap-6">
            <p className="font-mono text-[12px] text-text-muted">
              {filtered.length} {filtered.length === 1 ? 'booking' : 'bookings'} on this page
            </p>
            <p className="font-mono text-[12px] text-text-muted">
              {formatPrice(totalRevenue)} revenue (confirmed, this page)
            </p>
          </div>

          {/* Table */}
          <div className="rounded-[var(--radius-card)] border-[0.5px] border-border bg-card shadow-[var(--shadow-card)] overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b-[0.5px] border-border bg-surface-sunk">
                  <th className="px-4 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-text-muted">
                    Ref
                  </th>
                  <th className="px-4 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-text-muted">
                    Customer
                  </th>
                  <th className="hidden px-4 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-text-muted md:table-cell">
                    Showtime
                  </th>
                  <th className="hidden px-4 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-text-muted lg:table-cell">
                    Seats
                  </th>
                  <th className="px-4 py-3 text-right font-mono text-[11px] uppercase tracking-wider text-text-muted">
                    Total
                  </th>
                  <th className="px-4 py-3 text-center font-mono text-[11px] uppercase tracking-wider text-text-muted">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-text-muted">
                      No bookings match your search
                    </td>
                  </tr>
                ) : (
                  filtered.map((b, i) => (
                    <tr
                      key={b.id}
                      className={cn(
                        'transition-colors hover:bg-surface-sunk/40',
                        i < filtered.length - 1 && 'border-b-[0.5px] border-border',
                        b.status === 'cancelled' && 'opacity-60',
                      )}
                    >
                      <td className="px-4 py-3 font-mono text-[12px] text-text-secondary">
                        {b.reference}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium leading-tight">{b.user?.name ?? '—'}</p>
                        <p className="text-[11px] text-text-muted">{b.user?.email ?? ''}</p>
                      </td>
                      <td className="hidden px-4 py-3 md:table-cell">
                        <p className="font-medium leading-tight">{b.showtime?.screenName ?? '—'}</p>
                        {b.showtime && (
                          <p className="text-[11px] text-text-muted">
                            {formatEventDate(b.showtime.startsAt).split(',')[0]}
                          </p>
                        )}
                      </td>
                      <td className="hidden px-4 py-3 lg:table-cell">
                        <span className="font-mono text-[12px] text-text-secondary">
                          {b.seats.map((s) => s.id).join(', ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {formatPrice(b.totalPrice)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={statusVariant(b)}>{statusLabel(b)}</Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {data.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-4">
              <Button variant="secondary" size="sm" disabled={data.page <= 1} onClick={() => setPage((p) => p - 1)}>
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
    </div>
  )
}
