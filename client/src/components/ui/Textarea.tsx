import * as React from 'react'
import { cn } from '@/lib/utils'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, id, className, ...props }, ref) => {
    const reactId = React.useId()
    const textareaId = id ?? reactId

    return (
      <div className="flex flex-col">
        {label && (
          <label htmlFor={textareaId} className="mb-1.5 text-[13px] text-text-secondary">
            {label}
          </label>
        )}
        <textarea
          id={textareaId}
          ref={ref}
          aria-invalid={error ? true : undefined}
          className={cn(
            'min-h-[100px] resize-y rounded-[var(--radius)] border-[0.5px] border-border bg-card px-3 py-2.5 text-[15px]',
            'placeholder:text-text-muted transition-colors',
            'focus-visible:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink',
            error && 'border-destructive',
            className,
          )}
          {...props}
        />
        {error && (
          <p role="alert" className="mt-1.5 text-[13px] text-destructive">
            {error}
          </p>
        )}
      </div>
    )
  },
)
Textarea.displayName = 'Textarea'
