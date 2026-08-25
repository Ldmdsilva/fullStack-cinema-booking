import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius)] font-medium transition-[filter,background-color,border-color] duration-120 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-primary-foreground hover:brightness-[0.94] active:brightness-[0.88]',
        secondary:
          'bg-transparent text-foreground border-[0.5px] border-border-strong hover:bg-secondary',
        ghost:
          'bg-transparent text-text-secondary hover:bg-secondary hover:text-foreground',
        danger:
          'bg-transparent text-destructive border-[0.5px] border-current hover:bg-[var(--status-cancelled-bg)]',
        gold: 'bg-marquee-gold text-ink hover:brightness-[0.94] active:brightness-[0.88]',
      },
      size: {
        sm: 'h-8 px-3.5 text-[13px]',
        md: 'h-[42px] px-5 text-sm',
        lg: 'h-12 px-7 text-[15px]',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean
  fullWidth?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, isLoading, fullWidth, children, disabled, ...props },
    ref,
  ) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), fullWidth && 'w-full', className)}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {isLoading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  ),
)
Button.displayName = 'Button'
