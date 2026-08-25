import { useNavigate, Link } from 'react-router-dom'
import { ArrowRight, Radio, MapPin, Clock, Ticket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FilmCard } from '@/components/FilmCard'
import { TicketStub } from '@/components/TicketStub'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorState } from '@/components/ui/ErrorState'
import { EmptyState } from '@/components/ui/EmptyState'
import { useAsync } from '@/hooks/useAsync'
import * as filmsApi from '@/lib/api/films'
import * as cinemasApi from '@/lib/api/cinemas'

// Pulse dot — the live-sync indicator used across the hero
function PulseDot({ className = '' }: { className?: string }) {
  return (
    <span className={`relative flex size-2 ${className}`}>
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-seat-free opacity-60" />
      <span className="relative inline-flex size-2 rounded-full bg-seat-free" />
    </span>
  )
}

// Perforated tear-line divider
function TearLine() {
  return (
    <div className="relative flex items-center py-2" aria-hidden>
      <div className="flex-1 border-t-2 border-dashed border-border-strong/40" />
      <span className="mx-4 flex size-6 items-center justify-center rounded-full bg-ink">
        <Ticket className="size-3 text-marquee-gold" />
      </span>
      <div className="flex-1 border-t-2 border-dashed border-border-strong/40" />
    </div>
  )
}

// Stat pill used in the hero
function StatPill({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center rounded-[var(--radius)] border-[0.5px] border-border bg-card px-5 py-3 shadow-[var(--shadow-card)]">
      <span className="font-mono text-[22px] font-medium leading-none tracking-[-0.02em]">
        {value}
      </span>
      <span className="mt-1 text-[11px] text-text-muted">{label}</span>
    </div>
  )
}

// "2h 8m" / "48m"
function runtimeLabel(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function HomePage() {
  const navigate = useNavigate()

  // Fetch a small batch up front — one card doubles as the hero stub, the
  // rest fill the "Now showing" and "signature" sections below.
  const filmsState = useAsync(() => filmsApi.list({ limit: 4 }), [], {
    isEmpty: (d) => d.items.length === 0,
  })
  const cinemasState = useAsync(() => cinemasApi.list(), [], { isEmpty: (d) => d.length === 0 })

  const films = filmsState.status === 'success' || filmsState.status === 'empty' ? filmsState.data.items : []
  const totalFilms = filmsState.status === 'success' || filmsState.status === 'empty' ? filmsState.data.total : 0
  const heroFilm = films[0]
  const featuredFilms = films.slice(0, 3)
  const cinemas = cinemasState.status === 'success' || cinemasState.status === 'empty' ? cinemasState.data : []

  return (
    <>
      {/* ─── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b-[0.5px] border-border">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 sm:py-24 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          {/* Left: headline + CTA */}
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-[var(--radius-pill)] border-[0.5px] border-seat-free/30 bg-seat-free/10 px-3 py-1.5">
              <PulseDot />
              <span className="font-mono text-[11px] uppercase tracking-widest text-seat-free">
                Live seat maps · Now showing
              </span>
            </div>

            <h1 className="mt-2 font-voice text-[48px] font-medium leading-[1.0] tracking-[-0.025em] sm:text-[64px] lg:text-[72px]">
              Pick your seat,{' '}
              <em className="not-italic text-stamp-red">not just</em> your
              screening.
            </h1>

            <p className="mt-5 max-w-lg text-[18px] leading-[1.7] text-text-secondary">
              Encore shows you every seat in the house — live, as they sell.
              Book what you actually want, get a printed ticket stub, and watch
              the screen fill in real time.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={() => navigate('/films')}>
                Browse films
                <ArrowRight className="size-4" />
              </Button>
              <Button variant="secondary" size="lg" onClick={() => navigate('/login')}>
                Create account
              </Button>
            </div>

            {/* Stat row */}
            <div className="mt-10 flex flex-wrap gap-3">
              <StatPill value={String(totalFilms)} label="films now showing" />
              <StatPill value={String(cinemas.length)} label="cinemas" />
              <StatPill value="<1s" label="seat-sync time" />
            </div>
          </div>

          {/* Right: hero ticket stub */}
          <div className="relative flex flex-col items-center">
            {/* Shadow stack illusion */}
            <div className="absolute inset-x-4 top-3 h-full rounded-[var(--radius-card)] bg-ink/10" />
            <div className="absolute inset-x-2 top-1.5 h-full rounded-[var(--radius-card)] bg-ink/6" />

            {filmsState.status === 'loading' && <Spinner label="Loading films…" className="relative w-full" />}
            {filmsState.status === 'error' && (
              <ErrorState
                description={filmsState.error.message}
                onRetry={filmsState.retry}
                className="relative w-full"
              />
            )}
            {filmsState.status === 'empty' && (
              <EmptyState title="No films on sale yet" className="relative w-full" />
            )}
            {filmsState.status === 'success' && heroFilm && (
              <>
                <TicketStub
                  eyebrow={heroFilm.certificate}
                  title={heroFilm.title}
                  subtitle={heroFilm.genre.join(' · ')}
                  fields={[
                    { label: 'Runtime', value: runtimeLabel(heroFilm.runtimeMinutes) },
                    { label: 'Certificate', value: heroFilm.certificate },
                    { label: 'Genre', value: heroFilm.genre[0] ?? '—' },
                  ]}
                  serial={`FLM-${heroFilm.id.slice(-4).toUpperCase()}`}
                  onClick={() => navigate(`/films/${heroFilm.id}`)}
                  className="relative w-full max-w-sm"
                />

                {/* Live indicator below stub */}
                <div className="mt-3 flex items-center gap-2 text-[12px] text-text-muted">
                  <PulseDot />
                  <span>Seat map updating live</span>
                  <Radio className="size-3 text-seat-free" />
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ─── How it works ─────────────────────────────────────────────── */}
      <section className="border-b-[0.5px] border-border bg-surface-sunk/60">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <div className="mb-10 text-center">
            <p className="eyebrow text-stamp-red">The process</p>
            <h2 className="mt-3 font-voice text-[36px] font-medium tracking-[-0.02em]">
              Book in three moves
            </h2>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                step: '01',
                icon: MapPin,
                title: 'Find your film',
                body: 'Browse now-showing films by genre or title, then pick a cinema and time. Every showtime shows real-time seat count — no false "only 2 left" pressure.',
              },
              {
                step: '02',
                icon: Ticket,
                title: 'Pick your seats',
                body: 'Tap a seat on the live map to select it. Green means available. If another moviegoer takes it while you browse, it turns grey immediately — no surprises at checkout.',
              },
              {
                step: '03',
                icon: Clock,
                title: 'Get your stub',
                body: "Confirm with Stripe test-mode payment and your printed ticket stub appears once it's confirmed. One stub per seat, with section, row, and a real barcode. That's your ticket.",
              },
            ].map(({ step, icon: Icon, title, body }) => (
              <div
                key={step}
                className="relative rounded-[var(--radius-card)] border-[0.5px] border-border bg-card p-6 shadow-[var(--shadow-card)]"
              >
                <div className="mb-4 flex items-start justify-between">
                  <span className="flex size-10 items-center justify-center rounded-[6px] bg-ink">
                    <Icon className="size-5 text-marquee-gold" />
                  </span>
                  <span className="font-mono text-[32px] font-medium leading-none text-border-strong/60">
                    {step}
                  </span>
                </div>
                <h3 className="text-[18px] font-medium">{title}</h3>
                <p className="mt-2 text-[14px] leading-[1.65] text-text-secondary">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Now showing ──────────────────────────────────────────────── */}
      <section className="border-b-[0.5px] border-border">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <div className="mb-8 flex items-baseline justify-between">
            <div>
              <p className="eyebrow text-stamp-red">On screen now</p>
              <h2 className="mt-2 font-voice text-[36px] font-medium tracking-[-0.02em]">
                Now showing
              </h2>
            </div>
            <Link
              to="/films"
              className="flex items-center gap-1 text-[14px] text-stamp-red transition-opacity hover:opacity-75"
            >
              All films <ArrowRight className="size-4" />
            </Link>
          </div>

          {filmsState.status === 'loading' && <Spinner label="Loading films…" />}
          {filmsState.status === 'error' && (
            <ErrorState description={filmsState.error.message} onRetry={filmsState.retry} />
          )}
          {filmsState.status === 'empty' && (
            <EmptyState title="No films on sale yet" description="Check back soon." />
          )}
          {filmsState.status === 'success' && (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {featuredFilms.map((f) => (
                <FilmCard key={f.id} film={f} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ─── The stub — product statement ─────────────────────────────── */}
      <section className="border-b-[0.5px] border-border">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <TearLine />

          <div className="mt-12 grid items-center gap-12 lg:grid-cols-2">
            <div>
              <p className="eyebrow text-ash">The signature</p>
              <h2 className="mt-3 font-voice text-[40px] font-medium leading-[1.05] tracking-[-0.025em]">
                A ticket you can almost tear.
              </h2>
              <p className="mt-4 text-[16px] leading-[1.75] text-text-secondary">
                Every booking produces a printed ticket stub — ink panel, dashed
                tear-line, barcode. The kind of thing you'd find folded in a
                jacket pocket years later and remember exactly which screening
                you sat in.
              </p>
              <p className="mt-3 text-[16px] leading-[1.75] text-text-secondary">
                One stub per seat. Section, row, price, and a serial number tied
                to your booking reference. No scanning app needed — just the
                reference on the door.
              </p>
              <Button
                className="mt-7"
                variant="secondary"
                size="md"
                onClick={() => navigate('/films')}
              >
                Find a film to book
              </Button>
            </div>

            {/* Stacked stubs */}
            {filmsState.status === 'success' && (
              <div className="relative flex flex-col gap-3 lg:pl-6">
                {featuredFilms.map((film, i) => (
                  <div
                    key={film.id}
                    className="transition-transform duration-200 hover:-translate-y-1"
                    style={{ zIndex: 3 - i }}
                  >
                    <TicketStub
                      variant="compact"
                      eyebrow={film.certificate}
                      title={film.title}
                      subtitle={runtimeLabel(film.runtimeMinutes)}
                      serial={`FLM-${film.id.slice(-4).toUpperCase()}`}
                      onClick={() => navigate(`/films/${film.id}`)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ─── Dark CTA ─────────────────────────────────────────────────── */}
      <section className="bg-ink">
        <div className="mx-auto max-w-6xl px-5 py-20 text-center">
          <p className="eyebrow text-marquee-gold">Ready when you are</p>
          <h2 className="mt-4 font-voice text-[44px] font-medium leading-[1.02] tracking-[-0.025em] text-ticket-paper sm:text-[56px]">
            The house is filling.
          </h2>
          <p className="mx-auto mt-4 max-w-md text-[17px] leading-[1.7] text-ticket-paper/60">
            Seats sell while you read this. Pick yours before the map turns grey.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Button
              size="lg"
              className="bg-stamp-red text-ticket-paper hover:bg-stamp-red/90"
              onClick={() => navigate('/films')}
            >
              Browse films
              <ArrowRight className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="lg"
              className="text-ticket-paper/70 hover:text-ticket-paper"
              onClick={() => navigate('/login')}
            >
              Create account
            </Button>
          </div>

          {/* Cinema list */}
          {cinemas.length > 0 && (
            <div className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              {cinemas.map((c) => (
                <span key={c.id} className="font-mono text-[11px] text-ticket-paper/30 uppercase tracking-wider">
                  {c.name} · {c.city}
                </span>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  )
}
