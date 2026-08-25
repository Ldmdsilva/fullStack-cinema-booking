import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TicketStub } from './TicketStub'

describe('TicketStub', () => {
  it('renders the eyebrow, title, subtitle, serial and fields', () => {
    render(
      <TicketStub
        eyebrow="FRI · 12 SEP · 20:00"
        title="Phoebe Wren"
        subtitle="The Half Moon · Colombo"
        serial="ENC-4471"
        fields={[
          { label: 'Seats', value: '2' },
          { label: 'Total', value: 'Rs 13,000.00' },
        ]}
      />,
    )
    expect(screen.getByText('FRI · 12 SEP · 20:00')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Phoebe Wren' })).toBeInTheDocument()
    expect(screen.getByText('The Half Moon · Colombo')).toBeInTheDocument()
    expect(screen.getByText('ENC-4471')).toBeInTheDocument()
    expect(screen.getByText('Seats')).toBeInTheDocument()
    expect(screen.getByText('Rs 13,000.00')).toBeInTheDocument()
  })

  it('renders as a plain, non-interactive container without onClick', () => {
    render(<TicketStub eyebrow="e" title="t" subtitle="s" serial="ENC-1" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders as a clickable button and fires onClick when provided', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<TicketStub eyebrow="e" title="t" subtitle="s" serial="ENC-1" onClick={onClick} />)
    const button = screen.getByRole('button')
    await user.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('omits the fields row in compact variant even when fields are provided', () => {
    render(
      <TicketStub
        variant="compact"
        eyebrow="e"
        title="t"
        subtitle="s"
        serial="ENC-1"
        fields={[{ label: 'Seats', value: '2' }]}
      />,
    )
    expect(screen.queryByText('Seats')).not.toBeInTheDocument()
  })

  it('renders a deterministic barcode for a given serial', () => {
    const { container: c1 } = render(<TicketStub eyebrow="e" title="t" subtitle="s" serial="ENC-4471" />)
    const bars1 = Array.from(c1.querySelectorAll('[aria-hidden] > span')).map((el) => (el as HTMLElement).style.width)

    const { container: c2 } = render(<TicketStub eyebrow="e" title="t" subtitle="s" serial="ENC-4471" />)
    const bars2 = Array.from(c2.querySelectorAll('[aria-hidden] > span')).map((el) => (el as HTMLElement).style.width)

    expect(bars1).toEqual(bars2)
    expect(bars1.length).toBeGreaterThan(0)
  })
})
