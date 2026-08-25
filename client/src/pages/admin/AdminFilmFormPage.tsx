import * as React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, Trash2 } from 'lucide-react'
import * as filmsApi from '@/lib/api/films'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { Textarea } from '@/components/ui/Textarea'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorState } from '@/components/ui/ErrorState'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/toast'
import { useAsync } from '@/hooks/useAsync'
import { parseApiError } from '@/lib/api/errors'
import type { FilmCertificate } from '@/lib/types'

const CERTIFICATES: FilmCertificate[] = ['U', 'PG', '12A', '15', '18']

interface FilmFormState {
  title: string
  synopsis: string
  certificate: FilmCertificate
  runtimeMinutes: string
  genre: string
  posterUrl: string
  releaseDate: string
}

const EMPTY_FORM: FilmFormState = {
  title: '',
  synopsis: '',
  certificate: 'U',
  runtimeMinutes: '',
  genre: '',
  posterUrl: '',
  releaseDate: '',
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

export function AdminFilmFormPage() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const isEdit = Boolean(id && id !== 'new')

  const filmState = useAsync(() => (isEdit && id ? filmsApi.getById(id) : Promise.resolve(null)), [id, isEdit])

  const [form, setForm] = React.useState<FilmFormState>(EMPTY_FORM)
  const [errors, setErrors] = React.useState<Partial<Record<keyof FilmFormState, string>>>({})
  const [saving, setSaving] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  // Derive the form's initial values from the fetched film once it lands.
  // Adjusted during render (React's documented alternative to an effect
  // that only mirrors another value) rather than in a useEffect, since the
  // fetch itself is what's async — not this synchronisation step.
  const [syncedFrom, setSyncedFrom] = React.useState<typeof filmState.data>(null)
  if (filmState.status === 'success' && filmState.data && filmState.data !== syncedFrom) {
    const existing = filmState.data
    setSyncedFrom(filmState.data)
    setForm({
      title: existing.title,
      synopsis: existing.synopsis,
      certificate: existing.certificate,
      runtimeMinutes: String(existing.runtimeMinutes),
      genre: existing.genre.join(', '),
      posterUrl: existing.posterUrl ?? '',
      releaseDate: existing.releaseDate.slice(0, 10),
    })
  }

  const set = (key: keyof FilmFormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }))
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  const validate = (): boolean => {
    const errs: Partial<Record<keyof FilmFormState, string>> = {}
    if (!form.title.trim()) errs.title = 'Title is required'
    if (!form.synopsis.trim()) errs.synopsis = 'Synopsis is required'
    if (!form.runtimeMinutes || Number(form.runtimeMinutes) <= 0) errs.runtimeMinutes = 'Enter a valid runtime'
    if (!form.genre.trim()) errs.genre = 'At least one genre is required'
    if (!form.releaseDate) errs.releaseDate = 'Release date is required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      const payload = {
        title: form.title.trim(),
        synopsis: form.synopsis.trim(),
        certificate: form.certificate,
        runtimeMinutes: Number(form.runtimeMinutes),
        genre: form.genre
          .split(',')
          .map((g) => g.trim())
          .filter(Boolean),
        posterUrl: form.posterUrl.trim() || undefined,
        releaseDate: new Date(form.releaseDate).toISOString(),
      }
      if (isEdit && id) {
        await filmsApi.update(id, payload)
        toast('Changes saved.', 'success')
      } else {
        await filmsApi.create(payload)
        toast('Film created.', 'success')
      }
      navigate('/admin/films')
    } catch (err) {
      toast(parseApiError(err).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!id) return
    setDeleting(true)
    try {
      await filmsApi.remove(id)
      toast('Film deleted.', 'success')
      navigate('/admin/films')
    } catch (err) {
      toast(parseApiError(err).message, 'error')
      setDeleting(false)
    }
  }

  if (isEdit && filmState.status === 'loading') {
    return <Spinner label="Loading film…" className="py-32" />
  }

  if (isEdit && filmState.status === 'error') {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <ErrorState description={filmState.error.message} onRetry={filmState.retry} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => navigate('/admin/films')}
          className="mb-4 flex items-center gap-1.5 text-[13px] text-text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back to films
        </button>
        <p className="font-mono text-[11px] uppercase tracking-widest text-text-muted">
          {isEdit ? 'Edit film' : 'New film'}
        </p>
        <h1 className="mt-1 font-voice text-[36px] font-medium leading-tight tracking-[-0.02em]">
          {isEdit ? form.title || 'Edit film' : 'Create film'}
        </h1>
      </div>

      <div className="flex flex-col gap-8">
        <FormSection title="Identity">
          <Input
            label="Title"
            placeholder="The Marfa Sessions"
            value={form.title}
            onChange={set('title')}
            error={errors.title}
          />
          <Input
            label="Genre (comma-separated)"
            placeholder="Drama, Music"
            value={form.genre}
            onChange={set('genre')}
            error={errors.genre}
          />
          <div>
            <Select label="Certificate" value={form.certificate} onChange={set('certificate')}>
              {CERTIFICATES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <Input
            label="Runtime (minutes)"
            type="number"
            min="1"
            placeholder="108"
            value={form.runtimeMinutes}
            onChange={set('runtimeMinutes')}
            error={errors.runtimeMinutes}
          />
          <FormRow>
            <Textarea
              label="Synopsis"
              placeholder="A short paragraph shown on the film detail page."
              value={form.synopsis}
              onChange={set('synopsis')}
              error={errors.synopsis}
            />
          </FormRow>
        </FormSection>

        <FormSection title="Release">
          <Input
            label="Release date"
            type="date"
            value={form.releaseDate}
            onChange={set('releaseDate')}
            error={errors.releaseDate}
          />
          <FormRow>
            <Input
              label="Poster URL"
              type="url"
              placeholder="https://images.example.com/…"
              value={form.posterUrl}
              onChange={set('posterUrl')}
            />
          </FormRow>
          {form.posterUrl && (
            <FormRow>
              <div className="overflow-hidden rounded-[var(--radius)] border-[0.5px] border-border">
                <img src={form.posterUrl} alt="Poster preview" className="h-48 w-full object-cover" />
              </div>
            </FormRow>
          )}
        </FormSection>
      </div>

      {/* Footer actions */}
      <div className="mt-8 flex items-center justify-between border-t-[0.5px] border-border pt-6">
        {isEdit ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-4" />
            Delete film
          </Button>
        ) : (
          <div />
        )}
        <div className="flex gap-3">
          <Button variant="secondary" size="sm" onClick={() => navigate('/admin/films')}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} isLoading={saving}>
            <Save className="size-4" />
            {isEdit ? 'Save changes' : 'Create film'}
          </Button>
        </div>
      </div>

      <Modal
        open={deleteOpen}
        onClose={() => !deleting && setDeleteOpen(false)}
        title="Delete this film?"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={handleDelete} isLoading={deleting}>
              Delete film
            </Button>
          </>
        }
      >
        <p>
          <span className="font-medium text-foreground">{form.title || 'This film'}</span> will
          be permanently deleted. This cannot be undone.
        </p>
      </Modal>
    </div>
  )
}
