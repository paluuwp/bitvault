import { clsx } from 'clsx'

export interface ProgressBarProps {
  value: number
  /** Доступная подпись для role="progressbar". */
  label: string
  max?: number
  size?: 'sm' | 'md'
  showValue?: boolean
  className?: string
}

export function ProgressBar({
  value,
  label,
  max = 100,
  size = 'sm',
  showValue = false,
  className,
}: ProgressBarProps) {
  const safeMax = max > 0 ? max : 100
  const clamped = Math.min(Math.max(value, 0), safeMax)
  const percent = (clamped / safeMax) * 100

  return (
    <div className={clsx('flex w-full items-center gap-2', className)}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={clamped}
        className={clsx(
          'w-full overflow-hidden rounded-chip bg-bg-subtle shadow-sunken',
          size === 'sm' ? 'h-1.5' : 'h-2',
        )}
      >
        <div className="fl-meter-fill h-full" style={{ width: `${percent}%` }} />
      </div>
      {showValue && (
        <span className="shrink-0 font-mono text-mono-badge text-text-muted">
          {Math.round(percent)}%
        </span>
      )}
    </div>
  )
}
