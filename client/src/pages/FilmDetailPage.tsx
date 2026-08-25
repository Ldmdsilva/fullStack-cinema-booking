import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import { ArrowLeft, Clock, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/input'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorState } from '@/components/ui/ErrorState'
import { EmptyState } from '@/components/ui/EmptyState'
import { useAsync } from '@/hooks/useAsync'
import * as filmsApi from '@/lib/api/films'
import * as cinemasApi from '@/lib/api/cinemas'
import * as showtimesApi from '@/lib/api/showtimes'
import { formatPrice } from '@/lib/formatters'
import type { ShowtimeSummary } from '@/lib/types'

// "2h 8m" / "48m"
function runtimeLabel(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// yyyy-mm-dd, in the browser's local timezone, used both as a grouping key
// and to build the `from`/`to` bounds for a single-day filter.
function dateKey(iso: string): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function dayRange(key: string): { from: string; to: string } {
  const from = new Date(`${key}T00:00:00`)
  const to = new Date(`${key}T23:59:59.999`)
  return { from: from.toISOString(), to: to.toISOString() }
}

function dateHeading(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date(iso))
}

function timeLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
}

interface DateGroup {
  key: string
  heading: string
  showtimes: ShowtimeSummary[]
}

interface CinemaGroup {
  id: string
  name: string
  city?: string
  dates: DateGroup[]
}

// Groups a flat showtime list by cinema, then by calendar date, sorted so
// the picker reads top-to-bottom as cinema → date → ascending start time
// (FR-21).
function groupShowtimes(showtimes: ShowtimeSummary[]): CinemaGroup[] {
  const byCinema = new Map<string, CinemaGroup>()

  for (const s of showtimes) {
    const cinemaId = s.cinema?.id ?? 'unknown'
    if (!byCinema.has(cinemaId)) {
      byCinema.set(cinemaId, {
        id: cinemaId,
        name: s.cinema?.name ?? 'Cinema',
        city: s.cinema?.city,
        dates: [],
      })
    }
    const group = byCinema.get(cinemaId)!
    const key = dateKey(s.startsAt)
    let group_ = group.dates.find((d) => d.key === key)
    if (!group_) {
      group_ = { key, heading: dateHeading(s.startsAt), showtimes: [] }
      group.dates.push(group_)
    }
    group_.showtimes.push(s)
  }

  const groups = Array.from(byCinema.values())
  for (const g of groups) {
    g.dates.sort((a, b) => a.key.localeCompare(b.key))
    for (const d of g.dates) d.showtimes.sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  }
  groups.sort((a, b) => a.name.localeCompare(b.name))
  return groups
}

export function FilmDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const cinemaId = params.get('cinema') ?? ''
  const date = params.get('date') ?? ''

  const filmState = useAsync(() => filmsApi.getById(id!), [id])
  const cinemasState = useAsync(() => cinemasApi.list(), [])

  const range = date ? dayRange(date) : null
  const showtimesState = useAsync(
    () =>
      showtimesApi.list({
        filmId: id,
        limit: 100,
        cinemaId: cinemaId || undefined,
        from: range?.from,
        to: range?.to,
      }),
    [id, cinemaId, date],
    { isEmpty: (d) => d.items.length === 0 },
  )

  const setParam = (key: string, value: string) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    })
  }

  const hasFilters = Boolean(cinemaId || date)
  const clearFilters = () => setParams({}, { replace: true })

  if (filmState.status === 'loading') {
    return <Spinner label="Loading film…" className="py-32" />
  }

  if (filmState.status === 'error') {
    return (
      <div className="mx-auto max-w-6xl px-5 py-24 text-center">
        <ErrorState
          title="Film not found"
          description={filmState.error.message}
          onRetry={filmState.retry}
        />
        <Button className="mt-2" onClick={() => navigate('/films')}>
          Browse films
        </Button>
      </div>
    )
  }

  const film = filmState.data

  const cinemaOptions =
    cinemasState.status === 'success' || cinemasState.status === 'empty' ? cinemasState.data : []

  const cinemaGroups =
    showtimesState.status === 'success' || showtimesState.status === 'empty'
      ? groupShowtimes(showtimesState.data.items)
      : []

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <Link
        to="/films"
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-text-secondary hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All films
      </Link>

      {/* Header */}
      <header className="mb-10 grid gap-8 md:grid-cols-[240px_1fr]">
        <div className="aspect-[2/3] overflow-hidden rounded-[var(--radius-card)] bg-surface-sunk">
          {film.posterUrl && (
            <img src={film.posterUrl} alt="" className="size-full object-cover" loading="lazy" />
          )}
        </div>
        <div>
          <p className="eyebrow text-stamp-red">{film.certificate} · {runtimeLabel(film.runtimeMinutes)}</p>
          <h1 className="mt-2 font-voice text-[40px] font-medium leading-[1.02] tracking-[-0.02em] sm:text-[52px]">
            {film.title}
          </h1>
          <p className="mt-1 text-[15px] text-text-secondary">{film.genre.join(' · ')}</p>
          <p className="mt-4 max-w-xl text-[15px] leading-[1.7] text-text-secondary">{film.synopsis}</p>
        </div>
      </header>

      {/* Showtime filters */}
      <section className="mb-6 flex flex-col gap-3 border-t-[0.5px] border-border pt-6 md:flex-row md:items-end">
        <h2 className="mr-auto text-[20px] font-medium">Showtimes</h2>
        <Select
          label="Cinema"
          value={cinemaId}
          onChange={(e) => setParam('cinema', e.target.value)}
          className="md:w-52"
        >
          <option value="">All cinemas</option>
          {cinemaOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {c.city}
            </option>
          ))}
        </Select>
        <label className="flex flex-col">
          <span className="mb-1.5 text-[13px] text-text-secondary">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setParam('date', e.target.value)}
            className="h-[42px] rounded-[var(--radius)] border-[0.5px] border-border bg-card px-3 text-[15px] focus-visible:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink md:w-44"
          />
        </label>
        {hasFilters && (
          <Button variant="ghost" size="md" onClick={clearFilters} className="shrink-0">
            <X className="size-4" />
            Clear
          </Button>
        )}
      </section>

      {showtimesState.status === 'loading' && <Spinner label="Loading showtimes…" />}

      {showtimesState.status === 'error' && (
        <ErrorState description={showtimesState.error.message} onRetry={showtimesState.retry} />
      )}

      {showtimesState.status === 'empty' && (
        <EmptyState
          icon={Clock}
          title={hasFilters ? 'No showtimes match your filters' : 'No upcoming showtimes for this film'}
          description={
            hasFilters
              ? 'Try a different cinema or date, or clear your filters.'
              : 'Check back soon — new showtimes are added regularly.'
          }
          action={
            hasFilters ? (
              <Button variant="secondary" size="md" onClick={clearFilters} className="mt-2">
                Clear filters
              </Button>
            ) : undefined
          }
        />
      )}

      {showtimesState.status === 'success' && (
        <div className="flex flex-col gap-8">
          {cinemaGroups.map((group) => (
            <div
              key={group.id}
              data-testid={`cinema-group-${group.id}`}
              className="rounded-[var(--radius-card)] border-[0.5px] border-border bg-card p-5"
            >
              <h3 className="text-[17px] font-medium">{group.name}</h3>
              {group.city && <p className="text-[13px] text-text-muted">{group.city}</p>}

              <div className="mt-4 flex flex-col gap-4">
                {group.dates.map((dateGroup) => (
                  <div key={dateGroup.key}>
                    <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">
                      {dateGroup.heading}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {dateGroup.showtimes.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => navigate(`/showtimes/${s.id}`)}
                          disabled={s.availableSeats === 0}
                          className="flex flex-col items-center rounded-[var(--radius)] border-[0.5px] border-border-strong px-4 py-2 text-left transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                        >
                          <span className="font-mono text-[14px]">{timeLabel(s.startsAt)}</span>
                          <span className="font-mono text-[11px] text-text-muted">
                            {s.availableSeats === 0 ? 'Sold out' : `from ${formatPrice(s.basePrice)}`}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
