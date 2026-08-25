import type { ShowtimeSeat } from './types'

// "Rs 6,500.00" — Intl's LKR symbol rendering is inconsistent across
// engines, so the "Rs" prefix is applied directly over a plain grouped number.
export function formatPrice(n: number): string {
  const amount = new Intl.NumberFormat('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
  return `Rs ${amount}`
}

// "Fri 12 Sep 2026, 20:00"
export function formatEventDate(iso: string): string {
  const d = new Date(iso)
  const date = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d)
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
  return `${date}, ${time}`
}

// "FRI · 12 SEP · 20:00" — the mono eyebrow on the stub
export function formatStubDate(iso: string): string {
  const d = new Date(iso)
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short' })
    .format(d)
    .toUpperCase()
  const day = new Intl.DateTimeFormat('en-GB', { day: '2-digit' }).format(d)
  const month = new Intl.DateTimeFormat('en-GB', { month: 'short' })
    .format(d)
    .toUpperCase()
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
  return `${weekday} · ${day} ${month} · ${time}`
}

export function formatSeatLabel(seat: ShowtimeSeat): string {
  return seat.id
}
