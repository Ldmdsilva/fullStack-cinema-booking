import { cn } from '@/lib/utils'
import { formatPrice } from '@/lib/formatters'
import type { ShowtimeSeat } from '@/lib/types'

interface SeatProps {
  seat: ShowtimeSeat
  isSelected: boolean
  tabIndex: number
  onToggle: (id: string) => void
  onKeyNav: (e: React.KeyboardEvent, seat: ShowtimeSeat) => void
  registerRef: (id: string, el: HTMLButtonElement | null) => void
  // Id of the tier-heading element (rendered by SeatMap.tsx via
  // `tierHeadingId`) whose text names this seat's tier — wired up so
  // assistive tech can announce tier without it ever touching the frozen
  // aria-label grammar below.
  describedById?: string
}

// Tier is conveyed via border/outline only — never fill (fill stays
// reserved exclusively for availability status: available/held/booked/
// selected, per NFR-20 and the design doc's §7.2). Standard gets a plain
// hairline border; Premium a heavier border; Recliner an accent-corner
// treatment — all using the outline-only CSS tokens defined in index.css.
const TIER_BORDER_CLASSES: Record<ShowtimeSeat['tier'], string> = {
  STANDARD: 'border border-[color:var(--tier-standard-outline)]',
  PREMIUM: 'border-2 border-[color:var(--tier-premium-outline)]',
  RECLINER: 'border-2 border-[color:var(--tier-recliner-outline)] rounded-tr-[8px]',
}

export function Seat({
  seat,
  isSelected,
  tabIndex,
  onToggle,
  onKeyNav,
  registerRef,
  describedById,
}: SeatProps) {
  const isHeld = seat.status === 'held'
  const isBooked = seat.status === 'booked'
  const taken = isHeld || isBooked
  const state = isHeld ? 'held' : isBooked ? 'unavailable' : isSelected ? 'selected' : 'available'

  // FROZEN GRAMMAR — e2e/utils/seats.ts and Seat.test.tsx anchor on
  // `^Seat <id>, ` and `, available$` (etc). Do not reorder or reword; tier
  // is surfaced via `aria-describedby` (see `describedById`) instead of
  // being inserted into this string.
  const ariaLabel = isHeld
    ? `Seat ${seat.id}, row ${seat.row}, ${formatPrice(seat.price)}, on hold by another customer`
    : `Seat ${seat.id}, row ${seat.row}, ${formatPrice(seat.price)}, ${state}`

  return (
    <button
      ref={(el) => registerRef(seat.id, el)}
      type="button"
      tabIndex={tabIndex}
      disabled={taken}
      aria-disabled={taken}
      aria-pressed={isSelected}
      aria-label={ariaLabel}
      aria-describedby={describedById}
      onClick={() => !taken && onToggle(seat.id)}
      onKeyDown={(e) => onKeyNav(e, seat)}
      className={cn(
        'relative flex aspect-square items-center justify-center rounded-[4px] text-[9px] font-medium transition-[background-color] duration-150',
        TIER_BORDER_CLASSES[seat.tier],
        taken && 'cursor-not-allowed bg-seat-taken text-ink/40 opacity-55',
        !taken && !isSelected && 'cursor-pointer bg-seat-free text-white/85 hover:brightness-110',
        isSelected && 'cursor-pointer bg-marquee-gold text-ink',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
      )}
    >
      {/* Non-colour state cues for accessibility (NFR-11) */}
      {isSelected && (
        <span className="absolute inset-1 rounded-[2px] ring-2 ring-inset ring-ink/60" aria-hidden />
      )}
      {isHeld && (
        <span className="absolute inset-0.5 rounded-[3px] border border-dashed border-ink/30" aria-hidden />
      )}
      <span className="relative">{seat.number}</span>
    </button>
  )
}
