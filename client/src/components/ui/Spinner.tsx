import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SpinnerProps {
  label?: string
  className?: string
}

export function Spinner({ label = 'Loading…', className }: SpinnerProps) {
  return (
    <div role="status" className={cn('flex flex-col items-center justify-center gap-3 py-16 text-text-secondary', className)}>
      <Loader2 className="size-6 animate-spin" aria-hidden />
      <span className="text-[13px]">{label}</span>
    </div>
  )
}
