import { describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useAsync } from './useAsync'

describe('useAsync', () => {
  it('starts loading, then resolves to success with the fetched data', async () => {
    const fn = vi.fn().mockResolvedValue({ value: 42 })
    const { result } = renderHook(() => useAsync(fn, []))

    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.data).toEqual({ value: 42 })
  })

  it('defaults "empty" to an empty array result', async () => {
    const fn = vi.fn().mockResolvedValue([])
    const { result } = renderHook(() => useAsync(fn, []))
    await waitFor(() => expect(result.current.status).toBe('empty'))
  })

  it('uses a custom isEmpty predicate', async () => {
    const fn = vi.fn(async (): Promise<{ items: string[] }> => ({ items: [] }))
    const { result } = renderHook(() => useAsync(fn, [], { isEmpty: (d) => d.items.length === 0 }))
    await waitFor(() => expect(result.current.status).toBe('empty'))
  })

  it('surfaces a parsed error on failure', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useAsync(fn, []))
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error?.message).toBe('boom')
  })

  it('retry re-runs the fetch', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ ok: true })
    const { result } = renderHook(() => useAsync(fn, []))
    await waitFor(() => expect(result.current.status).toBe('error'))

    act(() => result.current.retry())
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(fn).toHaveBeenCalledTimes(2)
  })
})
