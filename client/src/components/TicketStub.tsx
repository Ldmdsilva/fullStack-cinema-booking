import { cn } from '@/lib/utils'

export interface TicketStubProps {
  eyebrow: string // formatStubDate() output
  title: string
  subtitle: string
  fields?: { label: string; value: string }[]
  serial: string
  variant?: 'full' | 'compact'
  onClick?: () => void
  className?: string
}

// Deterministic barcode: eight bars of varied width derived from the serial.
function Barcode({ serial }: { serial: string }) {
  const bars = Array.from({ length: 9 }, (_, i) => {
    const code = serial.charCodeAt(i % serial.length) + i
    return (code % 3) + 1 // 1–3px
  })
  return (
    <div className="flex h-[34px] items-end gap-[2px]" aria-hidden>
      {bars.map((w, i) => (
        <span
          key={i}
          className="block h-full bg-text-on-ink"
          style={{ width: `${w}px` }}
        />
      ))}
    </div>
  )
}

export function TicketStub({
  eyebrow,
  title,
  subtitle,
  fields = [],
  serial,
  variant = 'full',
  onClick,
  className,
}: TicketStubProps) {
  const compact = variant === 'compact'
  const Wrapper = onClick ? 'button' : 'div'

  return (
    <Wrapper
      onClick={onClick}
      className={cn(
        'group relative flex w-full overflow-hidden rounded-[var(--radius-card)] bg-ink text-left text-text-on-ink',
        onClick &&
          'cursor-pointer transition-shadow duration-150 hover:shadow-[var(--shadow-lift)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
        className,
      )}
    >
      {/* Left detail panel */}
      <div className={cn('flex-1', compact ? 'px-4 py-3' : 'px-5 py-[18px]')}>
        <p className="eyebrow text-marquee-gold">{eyebrow}</p>
        <h3
          className={cn(
            'font-voice font-medium tracking-[-0.01em] mt-1.5 mb-0.5 leading-[1.05]',
            compact ? 'text-[20px]' : 'text-[26px]',
          )}
        >
          {title}
        </h3>
        <p className="text-[14px] text-[#b8afa4]">{subtitle}</p>

        {!compact && fields.length > 0 && (
          <div className="mt-3.5 flex gap-6">
            {fields.map((f) => (
              <div key={f.label}>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ash">
                  {f.label}
                </p>
                <p className="font-mono text-[14px] text-text-on-ink">{f.value}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tear line with punched notches */}
      <div className="relative flex items-stretch">
        <span
          className="absolute -top-[6px] left-1/2 size-3 -translate-x-1/2 rounded-full bg-background"
          aria-hidden
        />
        <span
          className="absolute -bottom-[6px] left-1/2 size-3 -translate-x-1/2 rounded-full bg-background"
          aria-hidden
        />
        <span
          className="mx-auto block w-0 border-l-2 border-dashed border-[#55504a]"
          aria-hidden
        />
      </div>

      {/* Right stub */}
      <div
        className={cn(
          'flex w-[92px] flex-col items-center justify-center gap-2',
          compact ? 'py-3' : 'py-[18px]',
        )}
      >
        <Barcode serial={serial} />
        <p className="font-mono text-[10px] tracking-[0.1em] text-ash">{serial}</p>
      </div>
    </Wrapper>
  )
}
