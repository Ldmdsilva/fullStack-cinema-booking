import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Seat } from './Seat'
import type { ShowtimeSeat } from '@/lib/types'

function makeSeat(overrides: Partial<ShowtimeSeat> = {}): ShowtimeSeat {
  return {
    id: 'A-1',
    section: 'STALLS',
    row: 'A',
    number: 1,
    tier: 'STANDARD',
    status: 'available',
    price: 6500,
    ...overrides,
  }
}

const noop = () => {}

describe('Seat', () => {
  it('renders an available seat as pressable and enabled', () => {
    render(
      <Seat
        seat={makeSeat({ status: 'available' })}
        isSelected={false}
        tabIndex={0}
        onToggle={noop}
        onKeyNav={noop}
        registerRef={noop}
      />,
    )
    const button = screen.getByRole('button')
    expect(button).not.toBeDisabled()
    expect(button).toHaveAttribute('aria-disabled', 'false')
    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(button).toHaveAccessibleName(/available/i)
  })

  it('renders a selected available seat with aria-pressed true', () => {
    render(
      <Seat
        seat={makeSeat({ status: 'available' })}
        isSelected
        tabIndex={0}
        onToggle={noop}
        onKeyNav={noop}
        registerRef={noop}
      />,
    )
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true')
  })

  it('renders a held seat as disabled and announces it is on hold', () => {
    render(
      <Seat
        seat={makeSeat({ status: 'held' })}
        isSelected={false}
        tabIndex={-1}
        onToggle={noop}
        onKeyNav={noop}
        registerRef={noop}
      />,
    )
    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveAccessibleName(/on hold by another customer/i)
  })

  it('renders a booked seat as disabled', () => {
    render(
      <Seat
        seat={makeSeat({ status: 'booked' })}
        isSelected={false}
        tabIndex={-1}
        onToggle={noop}
        onKeyNav={noop}
        registerRef={noop}
      />,
    )
    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveAccessibleName(/unavailable/i)
  })

  it('calls onToggle when an available seat is clicked, but never for a taken seat', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()

    const { rerender } = render(
      <Seat
        seat={makeSeat({ status: 'available' })}
        isSelected={false}
        tabIndex={0}
        onToggle={onToggle}
        onKeyNav={noop}
        registerRef={noop}
      />,
    )
    await user.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalledWith('A-1')

    onToggle.mockClear()
    rerender(
      <Seat
        seat={makeSeat({ status: 'booked' })}
        isSelected={false}
        tabIndex={0}
        onToggle={onToggle}
        onKeyNav={noop}
        registerRef={noop}
      />,
    )
    await user.click(screen.getByRole('button'))
    expect(onToggle).not.toHaveBeenCalled()
  })

  // Regression test: the aria-label grammar's leading/trailing anchors are
  // relied on by e2e/utils/seats.ts and must survive byte-identical through
  // the cinema retheme (tier info is surfaced via aria-describedby instead).
  it('keeps the frozen aria-label anchors for an available seat', () => {
    render(
      <Seat
        seat={makeSeat({ id: 'C-7', row: 'C', status: 'available' })}
        isSelected={false}
        tabIndex={0}
        onToggle={noop}
        onKeyNav={noop}
        registerRef={noop}
      />,
    )
    const label = screen.getByRole('button').getAttribute('aria-label') ?? ''
    expect(label).toMatch(/^Seat C-7, /)
    expect(label).toMatch(/, available$/)
  })

  it('applies a distinct border treatment per tier without touching fill color', () => {
    const { rerender } = render(
      <Seat
        seat={makeSeat({ tier: 'STANDARD', status: 'available' })}
        isSelected={false}
        tabIndex={0}
        onToggle={noop}
        onKeyNav={noop}
        registerRef={noop}
      />,
    )
    const standardButton = screen.getByRole('button')
    expect(standardButton.className).toContain('bg-seat-free')
    expect(standardButton.className).toContain('var(--tier-standard-outline)')

    rerender(
      <Seat
        seat={makeSeat({ tier: 'RECLINER', status: 'available' })}
        isSelected={false}
        tabIndex={0}
        onToggle={noop}
        onKeyNav={noop}
        registerRef={noop}
      />,
    )
    const reclinerButton = screen.getByRole('button')
    // Fill stays availability-driven (still seat-free) — only the outline differs.
    expect(reclinerButton.className).toContain('bg-seat-free')
    expect(reclinerButton.className).toContain('var(--tier-recliner-outline)')
  })

  it('wires aria-describedby to the id passed by SeatMap for tier labeling', () => {
    render(
      <Seat
        seat={makeSeat({ status: 'available' })}
        isSelected={false}
        tabIndex={0}
        onToggle={noop}
        onKeyNav={noop}
        registerRef={noop}
        describedById="tier-heading-STANDARD"
      />,
    )
    expect(screen.getByRole('button')).toHaveAttribute('aria-describedby', 'tier-heading-STANDARD')
  })
})
