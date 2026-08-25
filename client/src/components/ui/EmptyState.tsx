import type { LucideIcon } from 'lucide-react'
import { Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-3 py-16 text-center', className)}>
      <Icon className="size-8 text-text-muted" aria-hidden />
      <p className="text-[15px] font-medium">{title}</p>
      {description && <p className="max-w-sm text-[13px] text-text-secondary">{description}</p>}
      {action}
    </div>
  )
}
