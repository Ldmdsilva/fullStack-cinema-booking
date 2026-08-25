import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { Input, Select } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorState } from '@/components/ui/ErrorState'
import { FilmCard } from '@/components/FilmCard'
import { useAsync } from '@/hooks/useAsync'
import * as filmsApi from '@/lib/api/films'

const PAGE_SIZE = 9

// A fixed genre list keeps the filter usable even before the first page of
// films has loaded — the server's `genre` field is free text, so this is a
// curated set of the genres the seed data uses rather than an enum.
const GENRES = ['Drama', 'Comedy', 'Action', 'Thriller', 'Mystery', 'Music', 'Animation', 'Documentary']

export function FilmListPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const genre = params.get('genre') ?? ''
  const page = Number(params.get('page') ?? '1')

  const [search, setSearch] = React.useState(q)

  // Debounce the free-text search into the URL (shareable, survives refresh).
  React.useEffect(() => {
    const t = setTimeout(() => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (search) next.set('q', search)
          else next.delete('q')
          next.delete('page')
          return next
        },
        { replace: true },
      )
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the debounced text changes
  }, [search])

  const setParam = (key: string, value: string) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value)
      else next.delete(key)
      next.delete('page')
      return next
    })
  }

  const setPage = (nextPage: number) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      if (nextPage > 1) next.set('page', String(nextPage))
      else next.delete('page')
      return next
    })
  }

  const { status, data, error, retry } = useAsync(
    () =>
      filmsApi.list({
        page,
        limit: PAGE_SIZE,
        genre: genre || undefined,
        search: q || undefined,
      }),
    [q, genre, page],
    { isEmpty: (d) => d.items.length === 0 },
  )

  const hasFilters = q || genre
  const clear = () => {
    setSearch('')
    setParams({}, { replace: true })
  }

  return (
    <>
      {/* Hero */}
      <section className="border-b-[0.5px] border-border">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:py-20">
          <p className="eyebrow text-stamp-red">Now showing · Autumn 2026</p>
          <h1 className="mt-4 max-w-3xl font-voice text-[44px] font-medium leading-[1.02] tracking-[-0.02em] sm:text-[64px]">
            Every seat is a{' '}
            <span className="italic text-stamp-red">ticket</span> you can
            almost tear.
          </h1>
          <p className="mt-5 max-w-xl text-[17px] leading-[1.7] text-text-secondary">
            Live seat maps, honest availability, and a printed-stub confirmation
            for every screening. Pick your film and choose a showtime that suits you.
          </p>
        </div>
      </section>

      {/* Filter bar */}
      <section className="sticky top-16 z-30 border-b-[0.5px] border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-4 md:flex-row md:items-end">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-[34px] size-4 text-text-muted" />
            <Input
              label="Search"
              placeholder="Film title"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select
            label="Genre"
            value={genre}
            onChange={(e) => setParam('genre', e.target.value)}
            className="md:w-44"
          >
            <option value="">All genres</option>
            {GENRES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="md" onClick={clear} className="shrink-0">
              <X className="size-4" />
              Clear
            </Button>
          )}
        </div>
      </section>

      {/* Results */}
      <section className="mx-auto max-w-6xl px-5 py-10">
        <div className="mb-6 flex items-baseline justify-between">
          <h2 className="text-[22px] font-medium">Now showing</h2>
          {(status === 'success' || status === 'empty') && (
            <p className="font-mono text-[13px] text-text-muted">
              {data.total} {data.total === 1 ? 'film' : 'films'}
            </p>
          )}
        </div>

        {status === 'loading' && <Spinner label="Loading films…" />}

        {status === 'error' && <ErrorState description={error.message} onRetry={retry} />}

        {status === 'empty' && (
          <div className="rounded-[var(--radius-card)] border-[0.5px] border-dashed border-border-strong px-6 py-16 text-center">
            <h3 className="font-voice text-[24px] font-medium">
              No films match your search
            </h3>
            <p className="mx-auto mt-2 max-w-sm text-[15px] text-text-secondary">
              Try a different title or genre — or clear your filters to see
              everything showing.
            </p>
            <Button variant="secondary" size="md" onClick={clear} className="mt-6">
              Clear filters
            </Button>
          </div>
        )}

        {status === 'success' && (
          <>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {data.items.map((f) => (
                <FilmCard key={f.id} film={f} />
              ))}
            </div>

            {data.totalPages > 1 && (
              <div className="mt-10 flex items-center justify-center gap-4">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={data.page <= 1}
                  onClick={() => setPage(data.page - 1)}
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
                  onClick={() => setPage(data.page + 1)}
                >
                  Next
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </section>
    </>
  )
}
