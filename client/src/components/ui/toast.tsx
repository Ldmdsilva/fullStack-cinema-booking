import * as React from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type Variant = 'success' | 'error' | 'info'
interface Toast {
  id: number
  variant: Variant
  message: string
}

interface ToastCtx {
  toast: (message: string, variant?: Variant) => void
}

const Ctx = React.createContext<ToastCtx | null>(null)

export function useToast() {
  const ctx = React.useContext(Ctx)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

const icons = { success: CheckCircle2, error: AlertCircle, info: Info }

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([])
  const next = React.useRef(0)

  const remove = React.useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  const toast = React.useCallback(
    (message: string, variant: Variant = 'info') => {
      const id = next.current++
      setToasts((t) => [...t, { id, variant, message }])
      setTimeout(() => remove(id), 5000)
    },
    [remove],
  )

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-50 flex w-[340px] max-w-[calc(100vw-2rem)] flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => {
          const Icon = icons[t.variant]
          return (
            <div
              key={t.id}
              className={cn(
                'flex items-start gap-3 rounded-[var(--radius)] border-[0.5px] border-border bg-ink px-4 py-3 text-[14px] text-text-on-ink shadow-[var(--shadow-lift)]',
                'animate-in slide-in-from-bottom-2 fade-in',
              )}
            >
              <Icon
                className={cn(
                  'mt-0.5 size-4 shrink-0',
                  t.variant === 'success' && 'text-seat-free',
                  t.variant === 'error' && 'text-[#f0a3a3]',
                  t.variant === 'info' && 'text-marquee-gold',
                )}
                aria-hidden
              />
              <p className="flex-1 leading-snug">{t.message}</p>
              <button
                onClick={() => remove(t.id)}
                aria-label="Dismiss notification"
                className="text-ash hover:text-text-on-ink"
              >
                <X className="size-4" />
              </button>
            </div>
          )
        })}
      </div>
    </Ctx.Provider>
  )
}
