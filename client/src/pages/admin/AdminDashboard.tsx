import * as React from 'react'
import { Link } from 'react-router-dom'
import { TrendingUp, Calendar, BookOpen, Users, ArrowUpRight } from 'lucide-react'
import * as adminApi from '@/lib/api/admin'
import * as bookingsApi from '@/lib/api/bookings'
import { formatPrice, formatEventDate } from '@/lib/formatters'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorState } from '@/components/ui/ErrorState'
import { useAsync } from '@/hooks/useAsync'
import { cn } from '@/lib/utils'
import type { BookingStatus } from '@/lib/types'

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string
  value: string
  sub?: string
  icon: React.ElementType
  accent?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-card)] border-[0.5px] p-5',
        accent
          ? 'border-marquee-gold/30 bg-ink text-ticket-paper'
          : 'border-border bg-card shadow-[var(--shadow-card)]',
      )}
    >
      <div className="flex items-start justify-between">
        <p className={cn('text-[13px] font-medium', accent ? 'text-marquee-gold/80' : 'text-text-secondary')}>
          {label}
        </p>
        <span
          className={cn(
            'flex size-8 items-center justify-center rounded-[6px]',
            accent ? 'bg-marquee-gold/15' : 'bg-surface-sunk',
          )}
        >
          <Icon className={cn('size-4', accent ? 'text-marquee-gold' : 'text-text-secondary')} />
        </span>
      </div>
      <p
        className={cn(
          'mt-3 font-mono text-[28px] font-medium leading-none tracking-[-0.02em]',
          accent ? 'text-ticket-paper' : 'text-foreground',
        )}
      >
        {value}
      </p>
      {sub && (
        <p className={cn('mt-1.5 text-[12px]', accent ? 'text-ticket-paper/50' : 'text-text-muted')}>
          {sub}
        </p>
      )}
    </div>
  )
}

function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const variant = status === 'confirmed' ? 'confirmed' : 'cancelled'
  const label = status.charAt(0).toUpperCase() + status.slice(1)
  return <Badge variant={variant}>{label}</Badge>
}

export function AdminDashboard() {
  const statsState = useAsync(() => adminApi.stats(), [])
  const bookingsState = useAsync(() => bookingsApi.listAll({ limit: 8 }), [], {
    isEmpty: (d) => d.items.length === 0,
  })
  const showtimesState = useAsync(() => adminApi.listShowtimes({ limit: 50 }), [], {
    isEmpty: (d) => d.items.length === 0,
  })

  const recentBookings = bookingsState.status === 'success' ? bookingsState.data.items : []
  const topShowtimes =
    showtimesState.status === 'success'
      ? [...showtimesState.data.items].sort((a, b) => b.bookingCount - a.bookingCount).slice(0, 4)
      : []

  if (statsState.status === 'loading') {
    return <Spinner label="Loading dashboard…" className="py-32" />
  }

  if (statsState.status === 'error') {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8">
        <ErrorState description={statsState.error.message} onRetry={statsState.retry} />
      </div>
    )
  }

  const stats = statsState.data

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      {/* Page header */}
      <div className="mb-8">
        <p className="font-mono text-[11px] uppercase tracking-widest text-text-muted">
          Overview
        </p>
        <h1 className="mt-1 font-voice text-[36px] font-medium leading-tight tracking-[-0.02em]">
          Dashboard
        </h1>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Total Revenue"
          value={formatPrice(stats.totalRevenue)}
          sub="Confirmed bookings only"
          icon={TrendingUp}
          accent
        />
        <KpiCard
          label="Bookings"
          value={String(stats.totalBookings)}
          sub={`${stats.confirmedBookings} confirmed · ${stats.cancelledBookings} cancelled`}
          icon={BookOpen}
        />
        <KpiCard
          label="Showtimes"
          value={String(stats.totalShowtimes)}
          sub={`${stats.upcomingShowtimes} scheduled`}
          icon={Calendar}
        />
        <KpiCard
          label="Occupancy"
          value={`${stats.occupancyRate}%`}
          sub={`${stats.bookedSeats.toLocaleString()} of ${stats.totalSeats.toLocaleString()} seats`}
          icon={Users}
        />
      </div>

      {/* Occupancy bar */}
      <div className="mt-6 rounded-[var(--radius-card)] border-[0.5px] border-border bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-medium text-text-secondary">House occupancy across all events</p>
          <p className="font-mono text-[13px] text-text-muted">
            {stats.bookedSeats} / {stats.totalSeats} seats
          </p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-sunk">
          <div
            className="h-full rounded-full bg-stamp-red transition-all"
            style={{ width: `${stats.occupancyRate}%` }}
          />
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {/* Recent bookings */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[17px] font-medium">Recent bookings</h2>
            <Link
              to="/admin/bookings"
              className="flex items-center gap-1 text-[13px] text-stamp-red hover:underline"
            >
              View all <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
          <div className="rounded-[var(--radius-card)] border-[0.5px] border-border bg-card shadow-[var(--shadow-card)] overflow-hidden">
            {bookingsState.status === 'loading' && <Spinner label="Loading bookings…" className="py-10" />}
            {bookingsState.status === 'error' && (
              <ErrorState description={bookingsState.error.message} onRetry={bookingsState.retry} className="py-10" />
            )}
            {bookingsState.status === 'empty' && (
              <p className="px-4 py-10 text-center text-[13px] text-text-muted">No bookings yet.</p>
            )}
            {bookingsState.status === 'success' && (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b-[0.5px] border-border bg-surface-sunk">
                    <th className="px-4 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-text-muted">
                      Ref
                    </th>
                    <th className="px-4 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-text-muted">
                      Fan
                    </th>
                    <th className="hidden px-4 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-text-muted md:table-cell">
                      Showtime
                    </th>
                    <th className="px-4 py-3 text-right font-mono text-[11px] uppercase tracking-wider text-text-muted">
                      Total
                    </th>
                    <th className="px-4 py-3 text-right font-mono text-[11px] uppercase tracking-wider text-text-muted">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recentBookings.map((b, i) => (
                    <tr
                      key={b.id}
                      className={cn(
                        'transition-colors hover:bg-surface-sunk/50',
                        i < recentBookings.length - 1 && 'border-b-[0.5px] border-border',
                      )}
                    >
                      <td className="px-4 py-3 font-mono text-[12px] text-text-secondary">
                        {b.reference}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium leading-tight">{b.user?.name ?? '—'}</p>
                        <p className="text-[11px] text-text-muted">{b.user?.email ?? ''}</p>
                      </td>
                      <td className="hidden px-4 py-3 text-text-secondary md:table-cell">
                        <p className="leading-tight">{b.showtime?.screenName ?? '—'}</p>
                        {b.showtime && (
                          <p className="text-[11px] text-text-muted">
                            {formatEventDate(b.showtime.startsAt).split(',')[0]}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {formatPrice(b.totalPrice)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <BookingStatusBadge status={b.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Top showtimes */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[17px] font-medium">Top showtimes</h2>
            <Link
              to="/admin/showtimes"
              className="flex items-center gap-1 text-[13px] text-stamp-red hover:underline"
            >
              Manage <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
          <div className="flex flex-col gap-3">
            {showtimesState.status === 'loading' && <Spinner label="Loading showtimes…" className="py-10" />}
            {showtimesState.status === 'error' && (
              <ErrorState description={showtimesState.error.message} onRetry={showtimesState.retry} className="py-10" />
            )}
            {showtimesState.status === 'empty' && (
              <p className="py-10 text-center text-[13px] text-text-muted">No showtimes yet.</p>
            )}
            {topShowtimes.map((st) => {
              const pct = st.totalSeats > 0 ? Math.round(((st.totalSeats - st.availableSeats) / st.totalSeats) * 100) : 0
              return (
                <Link
                  key={st.id}
                  to={`/admin/showtimes/${st.id}/edit`}
                  className="group block rounded-[var(--radius-card)] border-[0.5px] border-border bg-card p-4 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)]"
                >
                  <p className="font-medium leading-tight group-hover:text-stamp-red transition-colors">
                    {st.film?.title ?? st.screenName}
                  </p>
                  <p className="mt-0.5 text-[12px] text-text-muted">
                    {st.cinema?.name ?? '—'} · {st.screenName}
                  </p>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex-1 mr-3 h-1.5 overflow-hidden rounded-full bg-surface-sunk">
                      <div
                        className="h-full rounded-full bg-seat-free"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="font-mono text-[11px] text-text-muted shrink-0">{pct}%</span>
                  </div>
                  <p className="mt-1.5 font-mono text-[11px] text-text-muted">
                    {formatEventDate(st.startsAt).split(',')[0]}
                  </p>
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
