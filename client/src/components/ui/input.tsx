import * as React from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

let idCounter = 0

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const reactId = React.useId()
    const inputId = id ?? `in-${reactId}-${idCounter++}`
    const describedBy = error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined

    return (
      <div className="flex flex-col">
        {label && (
          <label htmlFor={inputId} className="mb-1.5 text-[13px] text-text-secondary">
            {label}
          </label>
        )}
        <input
          id={inputId}
          ref={ref}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'h-[42px] rounded-[var(--radius)] border-[0.5px] border-border bg-card px-3 text-[15px]',
            'placeholder:text-text-muted transition-colors',
            'focus-visible:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink',
            error && 'border-destructive',
            className,
          )}
          {...props}
        />
        {error && (
          <p id={`${inputId}-err`} role="alert" className="mt-1.5 text-[13px] text-destructive">
            {error}
          </p>
        )}
        {!error && hint && (
          <p id={`${inputId}-hint`} className="mt-1.5 text-[13px] text-text-muted">
            {hint}
          </p>
        )}
      </div>
    )
  },
)
Input.displayName = 'Input'

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string }
>(({ className, label, id, children, ...props }, ref) => {
  const reactId = React.useId()
  const selectId = id ?? `sel-${reactId}`
  return (
    <div className="flex flex-col">
      {label && (
        <label htmlFor={selectId} className="mb-1.5 text-[13px] text-text-secondary">
          {label}
        </label>
      )}
      <select
        id={selectId}
        ref={ref}
        className={cn(
          'h-[42px] rounded-[var(--radius)] border-[0.5px] border-border bg-card px-3 text-[15px]',
          'transition-colors focus-visible:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink',
          className,
        )}
        {...props}
      >
        {children}
      </select>
    </div>
  )
})
Select.displayName = 'Select'
