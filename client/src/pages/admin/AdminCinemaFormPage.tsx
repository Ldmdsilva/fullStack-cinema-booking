import * as React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, Plus, Trash2, Copy } from 'lucide-react'
import * as cinemasApi from '@/lib/api/cinemas'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorState } from '@/components/ui/ErrorState'
import { useToast } from '@/components/ui/toast'
import { useAsync } from '@/hooks/useAsync'
import { parseApiError } from '@/lib/api/errors'
import { SEAT_TIERS, TIER_LABELS } from '@/lib/tiers'
import type { Cinema, CinemaScreenPayload, SeatLayoutItem, SeatTier } from '@/lib/types'

// Mirrors server/src/config/seatTiers.js MAX_SEATS_PER_SCREEN — the client
// can't import that server-only module, so the cap is duplicated here.
const MAX_SEATS_PER_SCREEN = 300

// A screen section's `tier` is written lowercase into SeatLayoutItem.section
// since showtimeService's SECTION_TO_TIER lookup matches known section names
// case-insensitively (standard/premium/recliner) — anything else silently
// falls back to STANDARD server-side, so the picker only ever offers these
// three values to keep every seat layout mapping cleanly onto a real tier.
interface ScreenSection {
  tier: string
  rows: string
  seatsPerRow: string
}

interface ScreenState {
  screenId: string
  name: string
  sections: ScreenSection[]
}

function defaultSection(): ScreenSection {
  return { tier: 'standard', rows: 'A,B,C,D', seatsPerRow: '10' }
}

function defaultScreen(n: number): ScreenState {
  return { screenId: String(n), name: `Screen ${n}`, sections: [defaultSection()] }
}

// The server's SeatLayoutItem carries only a flat seat list — reconstructing
// a screen's section blocks from it (for editing an existing cinema) can
// recover the grouping (tier, rows, seats-per-row) since the seed/creation
// path always lays sections out as contiguous row blocks.
function sectionsFromSeatLayout(seatLayout: SeatLayoutItem[]): ScreenSection[] {
  const byTier = new Map<string, SeatLayoutItem[]>()
  for (const seat of seatLayout) {
    const key = seat.section
    if (!byTier.has(key)) byTier.set(key, [])
    byTier.get(key)!.push(seat)
  }

  const sections: ScreenSection[] = []
  for (const [tier, seats] of byTier) {
    const rowMap = new Map<string, number>()
    for (const seat of seats) {
      rowMap.set(seat.row, Math.max(rowMap.get(seat.row) ?? 0, seat.number))
    }
    const rows = Array.from(rowMap.keys())
    const seatsPerRow = rows.length > 0 ? Math.max(...rowMap.values()) : 0
    sections.push({ tier: tier.toLowerCase(), rows: rows.join(','), seatsPerRow: String(seatsPerRow) })
  }
  return sections.length > 0 ? sections : [defaultSection()]
}

function screensFromCinema(cinema: Cinema): ScreenState[] {
  return cinema.screens.map((screen) => ({
    screenId: screen.screenId,
    name: screen.name,
    sections: sectionsFromSeatLayout(screen.seatLayout),
  }))
}

function buildSeatLayout(sections: ScreenSection[]): SeatLayoutItem[] {
  const seats: SeatLayoutItem[] = []
  for (const section of sections) {
    const rows = section.rows
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean)
    const perRow = parseInt(section.seatsPerRow, 10) || 0
    for (const row of rows) {
      for (let n = 1; n <= perRow; n++) {
        seats.push({ id: `${row}-${n}`, section: section.tier || 'standard', row, number: n })
      }
    }
  }
  return seats
}

function countSeats(sections: ScreenSection[]): number {
  return sections.reduce((sum, s) => {
    const rows = s.rows.split(',').filter(Boolean).length
    const perRow = parseInt(s.seatsPerRow, 10) || 0
    return sum + rows * perRow
  }, 0)
}

function nextScreenNumber(screens: ScreenState[]): number {
  let max = 0
  for (const s of screens) {
    const n = parseInt(s.screenId, 10)
    if (!Number.isNaN(n)) max = Math.max(max, n)
  }
  return max + 1
}

export function AdminCinemaFormPage() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const isEdit = Boolean(id && id !== 'new')

  const cinemaState = useAsync(
    () => (isEdit && id ? cinemasApi.getById(id) : Promise.resolve<Cinema | null>(null)),
    [id, isEdit],
  )

  const [name, setName] = React.useState('')
  const [city, setCity] = React.useState('')
  const [address, setAddress] = React.useState('')
  const [screens, setScreens] = React.useState<ScreenState[]>([defaultScreen(1)])
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [screenErrors, setScreenErrors] = React.useState<Record<number, string>>({})
  const [saving, setSaving] = React.useState(false)

  // Derive form state from the fetched cinema once it lands — adjusted
  // during render (React's documented alternative to an effect that only
  // mirrors another value) rather than in a useEffect, since the fetch
  // itself is what's async — not this synchronisation step.
  const [syncedFrom, setSyncedFrom] = React.useState<typeof cinemaState.data>(null)
  if (cinemaState.status === 'success' && cinemaState.data && cinemaState.data !== syncedFrom) {
    const existing = cinemaState.data
    setSyncedFrom(cinemaState.data)
    setName(existing.name)
    setCity(existing.city)
    setAddress(existing.address)
    setScreens(screensFromCinema(existing))
  }

  const updateSectionField = (screenIdx: number, sectionIdx: number, field: keyof ScreenSection, value: string) => {
    setScreens((prev) =>
      prev.map((screen, i) =>
        i !== screenIdx
          ? screen
          : {
              ...screen,
              sections: screen.sections.map((s, j) => (j === sectionIdx ? { ...s, [field]: value } : s)),
            },
      ),
    )
  }

  const addSection = (screenIdx: number) => {
    setScreens((prev) =>
      prev.map((screen, i) => (i !== screenIdx ? screen : { ...screen, sections: [...screen.sections, defaultSection()] })),
    )
  }

  const removeSection = (screenIdx: number, sectionIdx: number) => {
    setScreens((prev) =>
      prev.map((screen, i) =>
        i !== screenIdx ? screen : { ...screen, sections: screen.sections.filter((_, j) => j !== sectionIdx) },
      ),
    )
  }

  const updateScreenField = (screenIdx: number, field: 'screenId' | 'name', value: string) => {
    setScreens((prev) => prev.map((screen, i) => (i !== screenIdx ? screen : { ...screen, [field]: value })))
  }

  const addScreen = () => {
    setScreens((prev) => [...prev, defaultScreen(nextScreenNumber(prev))])
  }

  const duplicateScreen = (screenIdx: number) => {
    setScreens((prev) => {
      const source = prev[screenIdx]
      const n = nextScreenNumber(prev)
      const clone: ScreenState = {
        screenId: String(n),
        name: `${source.name} copy`,
        sections: source.sections.map((s) => ({ ...s })),
      }
      return [...prev, clone]
    })
  }

  const removeScreen = (screenIdx: number) => {
    setScreens((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== screenIdx)))
  }

  const validate = (): boolean => {
    const errs: Record<string, string> = {}
    if (!name.trim()) errs.name = 'Cinema name is required'
    if (!city.trim()) errs.city = 'City is required'
    if (!address.trim()) errs.address = 'Address is required'

    const screenErrs: Record<number, string> = {}
    const seenIds = new Set<string>()
    screens.forEach((screen, idx) => {
      if (!screen.screenId.trim()) {
        screenErrs[idx] = 'Screen ID is required'
        return
      }
      if (seenIds.has(screen.screenId.trim())) {
        screenErrs[idx] = `Screen ID "${screen.screenId}" is used by another screen`
        return
      }
      seenIds.add(screen.screenId.trim())
      if (!screen.name.trim()) {
        screenErrs[idx] = 'Screen name is required'
        return
      }
      const total = countSeats(screen.sections)
      if (total === 0) {
        screenErrs[idx] = 'Define at least one section with seats'
      } else if (total > MAX_SEATS_PER_SCREEN) {
        screenErrs[idx] = `Seat count (${total}) exceeds the ${MAX_SEATS_PER_SCREEN}-seat limit per screen`
      }
    })

    setErrors(errs)
    setScreenErrors(screenErrs)
    return Object.keys(errs).length === 0 && Object.keys(screenErrs).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      const payloadScreens: CinemaScreenPayload[] = screens.map((screen) => ({
        screenId: screen.screenId.trim(),
        name: screen.name.trim(),
        seatLayout: buildSeatLayout(screen.sections),
      }))
      const payload = { name: name.trim(), city: city.trim(), address: address.trim(), screens: payloadScreens }
      if (isEdit && id) {
        await cinemasApi.update(id, payload)
        toast('Changes saved.', 'success')
      } else {
        await cinemasApi.create(payload)
        toast('Cinema created.', 'success')
      }
      navigate('/admin/cinemas')
    } catch (err) {
      toast(parseApiError(err).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  if (isEdit && cinemaState.status === 'loading') {
    return <Spinner label="Loading cinema…" className="py-32" />
  }

  if (isEdit && cinemaState.status === 'error') {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <ErrorState description={cinemaState.error.message} onRetry={cinemaState.retry} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-8">
        <button
          onClick={() => navigate('/admin/cinemas')}
          className="mb-4 flex items-center gap-1.5 text-[13px] text-text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back to cinemas
        </button>
        <p className="font-mono text-[11px] uppercase tracking-widest text-text-muted">
          {isEdit ? 'Edit cinema' : 'New cinema'}
        </p>
        <h1 className="mt-1 font-voice text-[36px] font-medium leading-tight tracking-[-0.02em]">
          {isEdit ? name || 'Edit cinema' : 'Create cinema'}
        </h1>
      </div>

      <div className="flex flex-col gap-8">
        {/* Identity */}
        <div>
          <h2 className="mb-4 border-b-[0.5px] border-border pb-2 text-[13px] font-medium uppercase tracking-wider text-text-muted">
            Details
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Cinema name"
              placeholder="The Half Moon"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={errors.name}
            />
            <Input
              label="City"
              placeholder="Colombo"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              error={errors.city}
            />
            <div className="sm:col-span-2">
              <Input
                label="Full address"
                placeholder="123 Galle Road, Colombo 03"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                error={errors.address}
              />
            </div>
          </div>
        </div>

        {/* Screens */}
        <div>
          <div className="mb-4 flex items-center justify-between border-b-[0.5px] border-border pb-2">
            <h2 className="text-[13px] font-medium uppercase tracking-wider text-text-muted">
              Screens
            </h2>
            <button
              type="button"
              onClick={addScreen}
              className="flex items-center gap-1 text-[12px] text-stamp-red hover:underline"
            >
              <Plus className="size-3" /> Add screen
            </button>
          </div>

          <div className="flex flex-col gap-5">
            {screens.map((screen, screenIdx) => {
              const total = countSeats(screen.sections)
              const overCap = total > MAX_SEATS_PER_SCREEN
              return (
                <div
                  key={screenIdx}
                  className="rounded-[var(--radius-card)] border-[0.5px] border-border bg-card p-4"
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="grid flex-1 gap-3 sm:grid-cols-2">
                      <Input
                        label="Screen ID"
                        placeholder="1"
                        value={screen.screenId}
                        onChange={(e) => updateScreenField(screenIdx, 'screenId', e.target.value)}
                      />
                      <Input
                        label="Screen name"
                        placeholder="Screen 1"
                        value={screen.name}
                        onChange={(e) => updateScreenField(screenIdx, 'name', e.target.value)}
                      />
                    </div>
                    <div className="flex shrink-0 items-end gap-2 pb-0.5">
                      <button
                        type="button"
                        onClick={() => duplicateScreen(screenIdx)}
                        className="flex size-[42px] items-center justify-center rounded-[var(--radius)] border-[0.5px] border-border text-text-secondary transition-colors hover:border-border-strong hover:text-foreground"
                        title="Duplicate screen"
                      >
                        <Copy className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeScreen(screenIdx)}
                        disabled={screens.length <= 1}
                        className="flex size-[42px] items-center justify-center rounded-[var(--radius)] border-[0.5px] border-stamp-red/20 text-stamp-red transition-colors hover:bg-stamp-red/10 disabled:cursor-not-allowed disabled:opacity-40"
                        title="Remove screen"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>

                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[13px] text-text-secondary">Seat sections</p>
                    <div className="flex items-center gap-3">
                      <span className={cn('font-mono text-[12px]', overCap ? 'text-destructive' : 'text-text-muted')}>
                        {total} / {MAX_SEATS_PER_SCREEN} seats
                      </span>
                      <button
                        type="button"
                        onClick={() => addSection(screenIdx)}
                        className="flex items-center gap-1 text-[12px] text-stamp-red hover:underline"
                      >
                        <Plus className="size-3" /> Add section
                      </button>
                    </div>
                  </div>

                  {screenErrors[screenIdx] && (
                    <p className="mb-2 text-[13px] text-destructive">{screenErrors[screenIdx]}</p>
                  )}

                  <div className="flex flex-col gap-2">
                    {screen.sections.map((section, sectionIdx) => (
                      <div
                        key={sectionIdx}
                        className="grid gap-3 rounded-[var(--radius)] border-[0.5px] border-border bg-surface-sunk p-3 sm:grid-cols-4"
                      >
                        <div>
                          <Select
                            label="Tier"
                            value={section.tier}
                            onChange={(e) => updateSectionField(screenIdx, sectionIdx, 'tier', e.target.value)}
                          >
                            {SEAT_TIERS.map((tier: SeatTier) => (
                              <option key={tier} value={tier.toLowerCase()}>
                                {TIER_LABELS[tier]}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <Input
                          label="Rows (comma-sep)"
                          placeholder="A,B,C,D"
                          value={section.rows}
                          onChange={(e) => updateSectionField(screenIdx, sectionIdx, 'rows', e.target.value)}
                        />
                        <Input
                          label="Seats per row"
                          type="number"
                          min="1"
                          max="50"
                          value={section.seatsPerRow}
                          onChange={(e) => updateSectionField(screenIdx, sectionIdx, 'seatsPerRow', e.target.value)}
                        />
                        <div className="flex items-end">
                          <button
                            type="button"
                            onClick={() => removeSection(screenIdx, sectionIdx)}
                            className="flex size-[42px] shrink-0 items-center justify-center rounded-[var(--radius)] border-[0.5px] border-stamp-red/20 text-stamp-red transition-colors hover:bg-stamp-red/10"
                            title="Remove section"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          <p className="mt-3 text-[12px] text-text-muted">
            Maximum {MAX_SEATS_PER_SCREEN} seats per screen. A section's tier drives its seat pricing
            multiplier system-wide — pick the tier the section actually is, not a display label.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 flex items-center justify-end gap-3 border-t-[0.5px] border-border pt-6">
        <Button variant="secondary" size="sm" onClick={() => navigate('/admin/cinemas')}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave} isLoading={saving}>
          <Save className="size-4" />
          {isEdit ? 'Save changes' : 'Create cinema'}
        </Button>
      </div>
    </div>
  )
}

// Local import kept at the bottom to avoid a diff-noise reorder — `cn` is
// only used for the seat-count-over-cap highlight above.
import { cn } from '@/lib/utils'
