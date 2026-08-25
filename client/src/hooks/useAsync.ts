import * as React from 'react'
import { parseApiError } from '@/lib/api/errors'
import type { ApiError } from '@/lib/types'

export type AsyncState<T> =
  | { status: 'loading'; data: null; error: null }
  | { status: 'error'; data: null; error: ApiError }
  | { status: 'empty'; data: T; error: null }
  | { status: 'success'; data: T; error: null }

export interface UseAsyncOptions<T> {
  /** Defaults to "an array with no items" when `data` is an array. */
  isEmpty?: (data: T) => boolean
}

/**
 * Runs an async fetch and exposes it as one of four render states —
 * loading, error, empty, success — so every async view can handle all of
 * them instead of just the happy path. Re-runs whenever `deps` change, and
 * exposes `retry` for an ErrorState's "Try again" button.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: React.DependencyList, options: UseAsyncOptions<T> = {}) {
  const [state, setState] = React.useState<AsyncState<T>>({ status: 'loading', data: null, error: null })
  const { isEmpty } = options

  const run = React.useCallback(() => {
    let cancelled = false
    setState({ status: 'loading', data: null, error: null })

    fn()
      .then((data) => {
        if (cancelled) return
        const empty = isEmpty ? isEmpty(data) : Array.isArray(data) && data.length === 0
        setState({ status: empty ? 'empty' : 'success', data, error: null })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setState({ status: 'error', data: null, error: parseApiError(err) })
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `deps` is the caller-controlled dependency list
  }, deps)

  React.useEffect(() => run(), [run])

  return { ...state, retry: run }
}
