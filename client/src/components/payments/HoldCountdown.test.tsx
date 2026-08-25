import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { act } from 'react'
import { HoldCountdown } from './HoldCountdown'

const future = (ms: number) => new Date(Date.now() + ms).toISOString()

describe('HoldCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the initial mm:ss remaining', () => {
    render(<HoldCountdown expiresAt={future(125_000)} />)
    expect(screen.getByText('2:05')).toBeInTheDocument()
  })

  it('ticks down once per second', () => {
    render(<HoldCountdown expiresAt={future(65_000)} />)
    expect(screen.getByText('1:05')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(screen.getByText('1:02')).toBeInTheDocument()
  })

  it('calls onExpire exactly once when the countdown reaches zero', () => {
    const onExpire = vi.fn()
    render(<HoldCountdown expiresAt={future(3000)} onExpire={onExpire} />)

    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(screen.getByText('0:00')).toBeInTheDocument()
    expect(onExpire).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(onExpire).toHaveBeenCalledTimes(1)
  })

  it('never shows negative time for an already-expired target', () => {
    const onExpire = vi.fn()
    render(<HoldCountdown expiresAt={future(-5000)} onExpire={onExpire} />)
    expect(screen.getByText('0:00')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(onExpire).toHaveBeenCalledTimes(1)
  })
})
