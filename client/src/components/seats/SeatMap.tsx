import * as React from 'react'
import { Seat } from './Seat'
import type { ShowtimeSeat } from '@/lib/types'
import { TIER_LABELS } from '@/lib/tiers'

interface SeatMapProps {
  seats: ShowtimeSeat[]
  selectedIds: string[]
  onToggle: (id: string) => void
  liveMessage: string
}

const SWATCH = 'inline-block size-3 rounded-[3px] align-middle'

// Shared id-generation scheme with Seat.tsx's aria-describedby wiring.
export const tierHeadingId = (tier: ShowtimeSeat['tier']) => `tier-heading-${tier}`

export function SeatMap({ seats, selectedIds, onToggle, liveMessage }: SeatMapProps) {
  const refs = React.useRef<Map<string, HTMLButtonElement>>(new Map())
  const [activeIdx, setActiveIdx] = React.useState(0)

  const registerRef = (id: string, el: HTMLButtonElement | null) => {
    if (el) refs.current.set(id, el)
    else refs.current.delete(id)
  }

  // Group seats by row, preserving section order.
  const rows = React.useMemo(() => {
    const map = new Map<string, ShowtimeSeat[]>()
    for (const s of seats) {
      if (!map.has(s.row)) map.set(s.row, [])
      map.get(s.row)!.push(s)
    }
    return Array.from(map.entries())
  }, [seats])

  // Tier-block grouping (§7.2 of the design doc): a row's tier is taken from
  // its first seat (screen layouts assign tier per contiguous row-range, not
  // per individual seat within a row). Consecutive rows sharing a tier form
  // one visual block, separated from the next block by an aisle gap and a
  // labeled heading. Each tier's heading is rendered once — with a stable,
  // globally addressable id — even if the tier reappears in a
  // non-contiguous block further down, so every seat of that tier can point
  // its `aria-describedby` at a single real element without colliding ids.
  const rowBlocks = React.useMemo(() => {
    const seenHeadingTiers = new Set<ShowtimeSeat['tier']>()
    let previousTier: ShowtimeSeat['tier'] | null = null
    return rows.map(([row, rowSeats]) => {
      const tier = rowSeats[0]?.tier ?? null
      const isNewBlock = tier !== previousTier
      previousTier = tier
      let renderHeadingId = false
      if (isNewBlock && tier && !seenHeadingTiers.has(tier)) {
        seenHeadingTiers.add(tier)
        renderHeadingId = true
      }
      return { row, rowSeats, tier, isNewBlock, renderHeadingId }
    })
  }, [rows])

  const flat = seats
  // Precomputed id → index map so keyboard nav and render stay O(1) per
  // seat instead of O(n) — venues can now reach 500 seats.
  const indexById = React.useMemo(() => {
    const map = new Map<string, number>()
    flat.forEach((s, i) => map.set(s.id, i))
    return map
  }, [flat])
  const rowLenBySeatId = React.useMemo(() => {
    const map = new Map<string, number>()
    for (const [, rowSeats] of rows) {
      for (const s of rowSeats) map.set(s.id, rowSeats.length)
    }
    return map
  }, [rows])

  const focusSeat = (idx: number) => {
    const clamped = Math.max(0, Math.min(flat.length - 1, idx))
    setActiveIdx(clamped)
    refs.current.get(flat[clamped].id)?.focus()
  }

  const onKeyNav = (e: React.KeyboardEvent, seat: ShowtimeSeat) => {
    const i = indexById.get(seat.id) ?? 0
    const rowLen = rowLenBySeatId.get(seat.id) ?? 12
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault()
        focusSeat(i + 1)
        break
      case 'ArrowLeft':
        e.preventDefault()
        focusSeat(i - 1)
        break
      case 'ArrowDown':
        e.preventDefault()
        focusSeat(i + rowLen)
        break
      case 'ArrowUp':
        e.preventDefault()
        focusSeat(i - rowLen)
        break
    }
  }

  return (
    <div>
      {/* Screen bar */}
      <div className="mb-6 rounded-[var(--radius)] bg-ink py-1.5 text-center font-mono text-[11px] tracking-[0.2em] text-marquee-gold">
        SCREEN
      </div>

      <div
        role="group"
        aria-label="Seat selection map"
        className="flex flex-col items-center gap-1.5"
      >
        {rowBlocks.map(({ row, rowSeats, tier, isNewBlock, renderHeadingId }) => (
          <React.Fragment key={row}>
            {isNewBlock && tier && (
              <div
                id={renderHeadingId ? tierHeadingId(tier) : undefined}
                className="mt-3 w-full text-center font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted first:mt-0"
              >
                {TIER_LABELS[tier]}
              </div>
            )}
            <div className="flex w-full items-center justify-center gap-1.5">
              <span className="w-4 shrink-0 text-right font-mono text-[11px] text-ash">
                {row}
              </span>
              <div
                className="grid flex-1 gap-1.5"
                style={{
                  gridTemplateColumns: `repeat(${rowSeats.length}, minmax(0, 1fr))`,
                  maxWidth: `${rowSeats.length * 34}px`,
                }}
              >
                {rowSeats.map((seat) => {
                  const globalIdx = indexById.get(seat.id) ?? 0
                  return (
                    <Seat
                      key={seat.id}
                      seat={seat}
                      isSelected={selectedIds.includes(seat.id)}
                      tabIndex={globalIdx === activeIdx ? 0 : -1}
                      onToggle={onToggle}
                      onKeyNav={onKeyNav}
                      registerRef={registerRef}
                      describedById={tierHeadingId(seat.tier)}
                    />
                  )
                })}
              </div>
              <span className="w-4 shrink-0" aria-hidden />
            </div>
          </React.Fragment>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12px] text-text-secondary">
        <span>
          <span className={`${SWATCH} bg-seat-free`} /> Available
        </span>
        <span>
          <span className={`${SWATCH} bg-marquee-gold`} /> Selected
        </span>
        <span>
          <span className={`${SWATCH} relative bg-seat-taken opacity-55`}>
            <span className="absolute inset-0 rounded-[3px] border border-dashed border-ink/30" />
          </span>{' '}
          On hold
        </span>
        <span>
          <span className={`${SWATCH} bg-seat-taken opacity-55`} /> Taken
        </span>
      </div>

      <div className="sr-only" aria-live="polite">
        {liveMessage}
      </div>
    </div>
  )
}
