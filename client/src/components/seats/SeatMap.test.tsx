import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SeatMap } from './SeatMap'
import type { ShowtimeSeat } from '@/lib/types'
import { TIER_LABELS } from '@/lib/tiers'

const seats: ShowtimeSeat[] = [
  { id: 'A-1', section: 'STALLS', row: 'A', number: 1, tier: 'STANDARD', status: 'available', price: 6500 },
  { id: 'A-2', section: 'STALLS', row: 'A', number: 2, tier: 'STANDARD', status: 'held', price: 6500 },
  { id: 'A-3', section: 'STALLS', row: 'A', number: 3, tier: 'STANDARD', status: 'booked', price: 6500 },
  { id: 'B-1', section: 'STALLS', row: 'B', number: 1, tier: 'PREMIUM', status: 'available', price: 8775 },
]

describe('SeatMap', () => {
  it('groups seats by row and renders one button per seat', () => {
    render(<SeatMap seats={seats} selectedIds={[]} onToggle={vi.fn()} liveMessage="" />)
    expect(screen.getAllByRole('button')).toHaveLength(seats.length)
    expect(screen.getByRole('group', { name: /seat selection map/i })).toBeInTheDocument()
  })

  it('marks selected seats as pressed', () => {
    render(<SeatMap seats={seats} selectedIds={['A-1']} onToggle={vi.fn()} liveMessage="" />)
    expect(screen.getByRole('button', { name: /seat a-1/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /seat b-1/i })).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls onToggle with the clicked available seat id', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(<SeatMap seats={seats} selectedIds={[]} onToggle={onToggle} liveMessage="" />)
    await user.click(screen.getByRole('button', { name: /seat a-1/i }))
    expect(onToggle).toHaveBeenCalledWith('A-1')
  })

  it('does not toggle held or booked seats', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(<SeatMap seats={seats} selectedIds={[]} onToggle={onToggle} liveMessage="" />)
    await user.click(screen.getByRole('button', { name: /seat a-2/i }))
    await user.click(screen.getByRole('button', { name: /seat a-3/i }))
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('renders the live region for screen-reader seat updates', () => {
    render(<SeatMap seats={seats} selectedIds={[]} onToggle={vi.fn()} liveMessage="Seat A-1 selected" />)
    expect(screen.getByText('Seat A-1 selected')).toBeInTheDocument()
  })

  it('moves focus across rows with arrow keys', async () => {
    const user = userEvent.setup()
    render(<SeatMap seats={seats} selectedIds={[]} onToggle={vi.fn()} liveMessage="" />)
    const first = screen.getByRole('button', { name: /seat a-1/i })
    first.focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('button', { name: /seat a-2/i })).toHaveFocus()
  })

  it('renders a SCREEN bar (cinema terminology, not the legacy STAGE label)', () => {
    render(<SeatMap seats={seats} selectedIds={[]} onToggle={vi.fn()} liveMessage="" />)
    expect(screen.getByText('SCREEN')).toBeInTheDocument()
    expect(screen.queryByText('STAGE')).not.toBeInTheDocument()
  })

  // Regression test: a later phase's e2e/utils/seats.ts and Seat.test.tsx
  // anchor regexes on the aria-label starting with `Seat <id>, ` and ending
  // with `, <state>` — this must survive the cinema retheme byte-identical.
  it('keeps the frozen aria-label grammar anchors on an available seat', () => {
    render(<SeatMap seats={seats} selectedIds={[]} onToggle={vi.fn()} liveMessage="" />)
    const button = screen.getByRole('button', { name: /seat a-1/i })
    const label = button.getAttribute('aria-label') ?? ''
    expect(label).toMatch(/^Seat A-1, /)
    expect(label).toMatch(/, available$/)
  })

  it('links each seat to a tier-heading element via aria-describedby, naming its tier', () => {
    render(<SeatMap seats={seats} selectedIds={[]} onToggle={vi.fn()} liveMessage="" />)

    const standardSeat = screen.getByRole('button', { name: /seat a-1/i })
    const standardDescribedById = standardSeat.getAttribute('aria-describedby')
    expect(standardDescribedById).toBeTruthy()
    expect(document.getElementById(standardDescribedById!)).toHaveTextContent(TIER_LABELS.STANDARD)

    const premiumSeat = screen.getByRole('button', { name: /seat b-1/i })
    const premiumDescribedById = premiumSeat.getAttribute('aria-describedby')
    expect(premiumDescribedById).toBeTruthy()
    expect(document.getElementById(premiumDescribedById!)).toHaveTextContent(TIER_LABELS.PREMIUM)

    // Distinct tiers must resolve to distinct heading elements.
    expect(premiumDescribedById).not.toBe(standardDescribedById)
  })

  it('renders a tier-block heading for each tier present', () => {
    render(<SeatMap seats={seats} selectedIds={[]} onToggle={vi.fn()} liveMessage="" />)
    expect(screen.getByText(TIER_LABELS.STANDARD)).toBeInTheDocument()
    expect(screen.getByText(TIER_LABELS.PREMIUM)).toBeInTheDocument()
  })
})
