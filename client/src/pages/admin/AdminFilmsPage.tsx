import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Pencil, Search, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import * as filmsApi from '@/lib/api/films'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorState } from '@/components/ui/ErrorState'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/toast'
import { useAsync } from '@/hooks/useAsync'
import { parseApiError } from '@/lib/api/errors'
import { cn } from '@/lib/utils'
import type { Film } from '@/lib/types'

const PAGE_SIZE = 20

export function AdminFilmsPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [page, setPage] = React.useState(1)
  const [search, setSearch] = React.useState('')
  const [deleteTarget, setDeleteTarget] = React.useState<Film | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [deleteError, setDeleteError] = React.useState<string | null>(null)

  const { status, data, error, retry } = useAsync(() => filmsApi.list({ page, limit: PAGE_SIZE }), [page], {
    isEmpty: (d) => d.items.length === 0,
  })

  const films = status === 'success' || status === 'empty' ? data.items : []
  const filtered = films.filter((f) =>
    `${f.title} ${f.genre.join(' ')} ${f.certificate}`.toLowerCase().includes(search.toLowerCase()),
  )

  const closeModal = () => {
    if (deleting) return
    setDeleteTarget(null)
    setDeleteError(null)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await filmsApi.remove(deleteTarget.id)
      toast('Film deleted.', 'success')
      setDeleteTarget(null)
      retry()
    } catch (err) {
      const apiError = parseApiError(err)
      if (apiError.code === 'FILM_IN_USE') {
        const details = apiError.details as { referencingShowtimesCount?: number } | undefined
        const count = details?.referencingShowtimesCount
        setDeleteError(
          count
            ? `Cannot delete "${deleteTarget.title}" — ${count} showtime${count === 1 ? '' : 's'} reference this film.`
            : apiError.message,
        )
      } else {
        setDeleteError(apiError.message)
      }
    } finally {
      setDeleting(false)
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
            Films
          </h1>
        </div>
        <Button onClick={() => navigate('/admin/films/new')} size="sm">
          <Plus className="size-4" />
          New film
        </Button>
      </div>

      {/* Search */}
      <div className="mb-5 relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-[34px] size-4 text-text-muted" />
        <Input
          label="Search films"
          placeholder="Title, genre, certificate…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {status === 'loading' && <Spinner label="Loading films…" />}
      {status === 'error' && <ErrorState description={error.message} onRetry={retry} />}
      {status === 'empty' && <EmptyState title="No films yet" description="Create your first film above." />}

      {status === 'success' && (
        <>
          {/* Table */}
          <div className="rounded-[var(--radius-card)] border-[0.5px] border-border bg-card shadow-[var(--shadow-card)] overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b-[0.5px] border-border bg-surface-sunk">
                  <th className="px-4 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-text-muted">
                    Film
                  </th>
                  <th className="hidden px-4 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-text-muted md:table-cell">
                    Certificate
                  </th>
                  <th className="hidden px-4 py-3 text-right font-mono text-[11px] uppercase tracking-wider text-text-muted lg:table-cell">
                    Runtime
                  </th>
                  <th className="px-4 py-3 text-right font-mono text-[11px] uppercase tracking-wider text-text-muted">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-text-muted">
                      No films match "{search}"
                    </td>
                  </tr>
                ) : (
                  filtered.map((film, i) => (
                    <tr
                      key={film.id}
                      className={cn(
                        'transition-colors hover:bg-surface-sunk/40',
                        i < filtered.length - 1 && 'border-b-[0.5px] border-border',
                      )}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium leading-tight">{film.title}</p>
                        <p className="mt-0.5 font-mono text-[11px] text-text-muted">
                          {film.genre.join(', ')}
                        </p>
                      </td>
                      <td className="hidden px-4 py-3 text-text-secondary md:table-cell">
                        {film.certificate}
                      </td>
                      <td className="hidden px-4 py-3 text-right font-mono lg:table-cell">
                        {film.runtimeMinutes} min
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            to={`/admin/films/${film.id}/edit`}
                            className="flex size-8 items-center justify-center rounded-[6px] border-[0.5px] border-border bg-card text-text-secondary transition-colors hover:border-border-strong hover:text-foreground"
                            title="Edit film"
                          >
                            <Pencil className="size-3.5" />
                          </Link>
                          <button
                            onClick={() => setDeleteTarget(film)}
                            className="flex size-8 items-center justify-center rounded-[6px] border-[0.5px] border-stamp-red/20 bg-stamp-red/5 text-stamp-red transition-colors hover:bg-stamp-red/15"
                            title="Delete film"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <p className="font-mono text-[12px] text-text-muted">
              {filtered.length} {filtered.length === 1 ? 'film' : 'films'} on this page
            </p>
            {data.totalPages > 1 && (
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
        open={deleteTarget !== null}
        onClose={closeModal}
        title="Delete this film?"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={closeModal} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={confirmDelete} isLoading={deleting}>
              Delete film
            </Button>
          </>
        }
      >
        {deleteError ? (
          <p role="alert" className="text-destructive">
            {deleteError}
          </p>
        ) : (
          deleteTarget && (
            <p>
              <span className="font-medium text-foreground">{deleteTarget.title}</span> will be
              permanently deleted. This cannot be undone.
            </p>
          )
        )}
      </Modal>
    </div>
  )
}
