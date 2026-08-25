import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, Search } from 'lucide-react'
import * as cinemasApi from '@/lib/api/cinemas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorState } from '@/components/ui/ErrorState'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { useAsync } from '@/hooks/useAsync'
import { parseApiError } from '@/lib/api/errors'
import { cn } from '@/lib/utils'
import type { CinemaSummary } from '@/lib/types'

export function AdminCinemasPage() {
  const navigate = useNavigate()
  const [search, setSearch] = React.useState('')
  const [deleteTarget, setDeleteTarget] = React.useState<CinemaSummary | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [deleteError, setDeleteError] = React.useState<string | null>(null)

  const cinemasState = useAsync(() => cinemasApi.list(), [], { isEmpty: (d) => d.length === 0 })

  const cinemas = cinemasState.status === 'success' || cinemasState.status === 'empty' ? cinemasState.data : []
  const filtered = cinemas.filter((c) => `${c.name} ${c.city}`.toLowerCase().includes(search.toLowerCase()))

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
      await cinemasApi.remove(deleteTarget.id)
      setDeleteTarget(null)
      cinemasState.retry()
    } catch (err) {
      const apiError = parseApiError(err)
      if (apiError.code === 'CINEMA_IN_USE') {
        const details = apiError.details as { referencingShowtimesCount?: number } | undefined
        const count = details?.referencingShowtimesCount
        setDeleteError(
          count
            ? `Cannot delete "${deleteTarget.name}" — ${count} showtime${count === 1 ? '' : 's'} reference this cinema.`
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
    <div className="mx-auto max-w-4xl px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex items-end justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-text-muted">
            Manage
          </p>
          <h1 className="mt-1 font-voice text-[36px] font-medium leading-tight tracking-[-0.02em]">
            Cinemas
          </h1>
        </div>
        <Button onClick={() => navigate('/admin/cinemas/new')} size="sm">
          <Plus className="size-4" />
          New cinema
        </Button>
      </div>

      {/* Search */}
      <div className="mb-5 relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-[34px] size-4 text-text-muted" />
        <Input
          label="Search cinemas"
          placeholder="Name or city…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {cinemasState.status === 'loading' && <Spinner label="Loading cinemas…" />}
      {cinemasState.status === 'error' && (
        <ErrorState description={cinemasState.error.message} onRetry={cinemasState.retry} />
      )}
      {cinemasState.status === 'empty' && (
        <EmptyState title="No cinemas yet" description="Create one above." />
      )}

      {cinemasState.status === 'success' && (
        <>
          {/* Table */}
          <div className="rounded-[var(--radius-card)] border-[0.5px] border-border bg-card shadow-[var(--shadow-card)] overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b-[0.5px] border-border bg-surface-sunk">
                  <th className="px-4 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-text-muted">
                    Cinema
                  </th>
                  <th className="hidden px-4 py-3 text-right font-mono text-[11px] uppercase tracking-wider text-text-muted md:table-cell">
                    Screens
                  </th>
                  <th className="px-4 py-3 text-right font-mono text-[11px] uppercase tracking-wider text-text-muted">
                    Capacity
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
                      No cinemas match "{search}"
                    </td>
                  </tr>
                ) : (
                  filtered.map((c, i) => (
                    <tr
                      key={c.id}
                      className={cn(
                        'transition-colors hover:bg-surface-sunk/40',
                        i < filtered.length - 1 && 'border-b-[0.5px] border-border',
                      )}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium leading-tight">{c.name}</p>
                        <p className="mt-0.5 text-[11px] text-text-muted">{c.address}, {c.city}</p>
                      </td>
                      <td className="hidden px-4 py-3 text-right font-mono text-text-secondary md:table-cell">
                        {c.screenCount}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-text-secondary">
                        {c.totalCapacity} seats
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            to={`/admin/cinemas/${c.id}/edit`}
                            className="flex size-8 items-center justify-center rounded-[6px] border-[0.5px] border-border bg-card text-text-secondary transition-colors hover:border-border-strong hover:text-foreground"
                            title="Edit cinema"
                          >
                            <Pencil className="size-3.5" />
                          </Link>
                          <button
                            onClick={() => setDeleteTarget(c)}
                            className="flex size-8 items-center justify-center rounded-[6px] border-[0.5px] border-stamp-red/20 bg-stamp-red/5 text-stamp-red transition-colors hover:bg-stamp-red/15"
                            title="Delete cinema"
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
          <p className="mt-3 font-mono text-[12px] text-text-muted">
            {filtered.length} {filtered.length === 1 ? 'cinema' : 'cinemas'}
          </p>
        </>
      )}

      <Modal
        open={deleteTarget !== null}
        onClose={closeModal}
        title="Delete this cinema?"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={closeModal} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={confirmDelete} isLoading={deleting}>
              Delete cinema
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
              <span className="font-medium text-foreground">{deleteTarget.name}</span> will be
              permanently deleted. This cannot be undone.
            </p>
          )
        )}
      </Modal>
    </div>
  )
}
