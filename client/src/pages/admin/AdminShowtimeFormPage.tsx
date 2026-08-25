import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Save } from 'lucide-react'
import * as filmsApi from '@/lib/api/films'
import * as cinemasApi from '@/lib/api/cinemas'
import * as showtimesApi from '@/lib/api/showtimes'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { Spinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/toast'
import { useAsync } from '@/hooks/useAsync'
import { parseApiError } from '@/lib/api/errors'
import { formatPrice } from '@/lib/formatters'
import { SEAT_TIERS, TIER_LABELS, TIER_MULTIPLIERS } from '@/lib/tiers'
import type { Cinema } from '@/lib/types'

interface ShowtimeFormState {
  filmRef: string
  cinemaRef: string
  screenId: string
  startsAt: string
  basePrice: string
}

const EMPTY_FORM: ShowtimeFormState = {
  filmRef: '',
  cinemaRef: '',
  screenId: '',
  startsAt: '',
  basePrice: '',
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-4 border-b-[0.5px] border-border pb-2 text-[13px] font-medium uppercase tracking-wider text-text-muted">
        {title}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </div>
  )
}

function FormRow({ children }: { children: React.ReactNode }) {
  return <div className="sm:col-span-2">{children}</div>
}

// Server has no generic "update showtime" endpoint (only create and a
// dedicated cancel action per showtimeRoutes.js), so this page only ever
// creates — there is no edit mode.
export function AdminShowtimeFormPage() {
  const navigate = useNavigate()
  const { toast } = useToast()

  const filmsState = useAsync(() => filmsApi.list({ limit: 100 }), [], { isEmpty: (d) => d.items.length === 0 })
  const cinemasState = useAsync(() => cinemasApi.list(), [], { isEmpty: (d) => d.length === 0 })

  const [form, setForm] = React.useState<ShowtimeFormState>(EMPTY_FORM)
  const [errors, setErrors] = React.useState<Partial<Record<keyof ShowtimeFormState, string>>>({})
  const [saving, setSaving] = React.useState(false)

  // Fetch the full Cinema (with screens) once one is selected — the summary
  // list has no screen data.
  const [cinemaDetail, setCinemaDetail] = React.useState<Cinema | null>(null)
  const [cinemaLoading, setCinemaLoading] = React.useState(false)
  React.useEffect(() => {
    if (!form.cinemaRef) {
      setCinemaDetail(null)
      return
    }
    let cancelled = false
    setCinemaLoading(true)
    cinemasApi
      .getById(form.cinemaRef)
      .then((c) => {
        if (!cancelled) setCinemaDetail(c)
      })
      .catch((err) => {
        if (!cancelled) toast(parseApiError(err).message, 'error')
      })
      .finally(() => {
        if (!cancelled) setCinemaLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-fetch when the selected cinema changes
  }, [form.cinemaRef])

  const set = (key: keyof ShowtimeFormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    setForm((prev) => ({
      ...prev,
      [key]: e.target.value,
      // Changing the cinema invalidates whichever screen was selected for the previous one.
      ...(key === 'cinemaRef' ? { screenId: '' } : {}),
    }))
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  const validate = (): boolean => {
    const errs: Partial<Record<keyof ShowtimeFormState, string>> = {}
    if (!form.filmRef) errs.filmRef = 'Select a film'
    if (!form.cinemaRef) errs.cinemaRef = 'Select a cinema'
    if (!form.screenId) errs.screenId = 'Select a screen'
    if (!form.startsAt) errs.startsAt = 'Start time is required'
    if (!form.basePrice || Number(form.basePrice) <= 0) errs.basePrice = 'Enter a valid price'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      await showtimesApi.create({
        filmRef: form.filmRef,
        cinemaRef: form.cinemaRef,
        screenId: form.screenId,
        startsAt: new Date(form.startsAt).toISOString(),
        basePrice: Number(form.basePrice),
      })
      toast('Showtime created.', 'success')
      navigate('/admin/showtimes')
    } catch (err) {
      toast(parseApiError(err).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const films = filmsState.status === 'success' || filmsState.status === 'empty' ? filmsState.data.items : []
  const cinemas = cinemasState.status === 'success' || cinemasState.status === 'empty' ? cinemasState.data : []
  const screens = cinemaDetail?.screens ?? []

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => navigate('/admin/showtimes')}
          className="mb-4 flex items-center gap-1.5 text-[13px] text-text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back to showtimes
        </button>
        <p className="font-mono text-[11px] uppercase tracking-widest text-text-muted">New showtime</p>
        <h1 className="mt-1 font-voice text-[36px] font-medium leading-tight tracking-[-0.02em]">
          Create showtime
        </h1>
      </div>

      <div className="flex flex-col gap-8">
        <FormSection title="Film & cinema">
          <div>
            <Select label="Film" value={form.filmRef} onChange={set('filmRef')}>
              <option value="">Select film…</option>
              {films.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title}
                </option>
              ))}
            </Select>
            {errors.filmRef && <p className="mt-1.5 text-[13px] text-destructive">{errors.filmRef}</p>}
          </div>
          <div>
            <Select label="Cinema" value={form.cinemaRef} onChange={set('cinemaRef')}>
              <option value="">Select cinema…</option>
              {cinemas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}, {c.city}
                </option>
              ))}
            </Select>
            {errors.cinemaRef && <p className="mt-1.5 text-[13px] text-destructive">{errors.cinemaRef}</p>}
          </div>
          <div>
            <Select
              label="Screen"
              value={form.screenId}
              onChange={set('screenId')}
              disabled={!form.cinemaRef || cinemaLoading}
            >
              <option value="">{cinemaLoading ? 'Loading screens…' : 'Select screen…'}</option>
              {screens.map((s) => (
                <option key={s.screenId} value={s.screenId}>
                  {s.name} ({s.capacity} seats)
                </option>
              ))}
            </Select>
            {errors.screenId && <p className="mt-1.5 text-[13px] text-destructive">{errors.screenId}</p>}
          </div>
        </FormSection>

        <FormSection title="When">
          <Input
            label="Starts at"
            type="datetime-local"
            value={form.startsAt}
            onChange={set('startsAt')}
            error={errors.startsAt}
          />
        </FormSection>

        <FormSection title="Ticketing">
          <Input
            label="Base price (LKR)"
            type="number"
            min="1"
            step="0.50"
            placeholder="1500.00"
            value={form.basePrice}
            onChange={set('basePrice')}
            error={errors.basePrice}
          />
          <FormRow>
            <div className="flex flex-col gap-1.5">
              <p className="text-[13px] text-text-secondary">Tier prices (system multipliers)</p>
              <div className="rounded-[var(--radius)] border-[0.5px] border-border bg-surface-sunk px-3 py-2.5 text-[13px] text-text-muted">
                {form.basePrice && Number(form.basePrice) > 0 ? (
                  SEAT_TIERS.map((tier) => (
                    <p key={tier} className="font-mono">
                      {TIER_LABELS[tier]}: {formatPrice(Math.round(Number(form.basePrice) * TIER_MULTIPLIERS[tier]))}
                    </p>
                  ))
                ) : (
                  <span>Enter a base price above</span>
                )}
              </div>
            </div>
          </FormRow>
        </FormSection>
      </div>

      {/* Footer actions */}
      <div className="mt-8 flex items-center justify-end gap-3 border-t-[0.5px] border-border pt-6">
        <Button variant="secondary" size="sm" onClick={() => navigate('/admin/showtimes')}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave} isLoading={saving}>
          <Save className="size-4" />
          Create showtime
        </Button>
      </div>

      {(filmsState.status === 'loading' || cinemasState.status === 'loading') && (
        <Spinner label="Loading films and cinemas…" className="py-8" />
      )}
    </div>
  )
}
