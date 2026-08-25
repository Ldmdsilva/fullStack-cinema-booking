import { useNavigate } from 'react-router-dom'
import { Ticket } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { TicketStub } from '@/components/TicketStub'
import type { Film } from '@/lib/types'

// "2h 8m" / "48m"
function runtimeLabel(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// A film-poster card for list/grid views (§FR-20). This is about a FILM, not
// any one showtime — a film can have many showtimes across cinemas and
// dates — so it links to the film detail page's showtime picker rather than
// straight into a booking flow.
export function FilmCard({ film }: { film: Film }) {
  const navigate = useNavigate()
  const go = () => navigate(`/films/${film.id}`)

  return (
    <article className="group flex flex-col overflow-hidden rounded-[var(--radius-card)] border-[0.5px] border-border bg-card shadow-[var(--shadow-card)] transition-shadow duration-200 hover:shadow-[var(--shadow-lift)]">
      <button
        onClick={go}
        className="relative block aspect-[2/3] overflow-hidden bg-surface-sunk text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"
        aria-label={`View ${film.title}`}
      >
        {film.posterUrl ? (
          <img
            src={film.posterUrl}
            alt=""
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            loading="lazy"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-surface-sunk">
            <Ticket className="size-8 text-text-muted" aria-hidden />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/10 to-transparent" />
        <div className="absolute left-3 top-3 flex items-center gap-2">
          <span className="eyebrow rounded-[var(--radius-pill)] bg-background/90 px-2.5 py-1 text-ink">
            {film.certificate}
          </span>
        </div>
        <div className="absolute bottom-3 right-3">
          <Badge variant="neutral">{runtimeLabel(film.runtimeMinutes)}</Badge>
        </div>
      </button>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <div>
          <p className="text-[13px] text-text-muted">{film.genre.join(' · ')}</p>
        </div>
        <div className="mt-auto">
          <TicketStub
            variant="compact"
            eyebrow={film.certificate}
            title={film.title}
            subtitle={film.genre[0] ?? 'Now showing'}
            serial={`FLM-${film.id.slice(-4).toUpperCase()}`}
            onClick={go}
          />
        </div>
      </div>
    </article>
  )
}
