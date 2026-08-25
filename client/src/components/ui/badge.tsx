import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-[var(--radius-pill)] px-3 py-1 text-xs font-medium',
  {
    variants: {
      variant: {
        confirmed: 'bg-[var(--status-confirmed-bg)] text-[var(--status-confirmed-fg)]',
        pending: 'bg-[var(--status-pending-bg)] text-[var(--status-pending-fg)]',
        cancelled: 'bg-[var(--status-cancelled-bg)] text-[var(--status-cancelled-fg)]',
        refunded: 'bg-[var(--status-refunded-bg)] text-[var(--status-refunded-fg)]',
        expired: 'bg-[var(--status-neutral-bg)] text-[var(--status-neutral-fg)]',
        neutral: 'bg-[var(--status-neutral-bg)] text-[var(--status-neutral-fg)]',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
