import { clsx } from 'clsx'
import type { ReactNode } from 'react'

export interface SegmentedControlOption<T extends string> {
  value: T
  label: string
  icon?: ReactNode
  /** Обязательная подпись для иконочной опции. */
  ariaLabel?: string
}

export interface SegmentedControlProps<T extends string> {
  label: string
  value: T
  options: readonly SegmentedControlOption<T>[]
  onChange: (value: T) => void
  size?: 'sm' | 'md'
  className?: string
}

/** Сегментированный переключатель из клавиш; управляется снаружи. */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  size = 'sm',
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={clsx(
        'inline-flex shrink-0 items-center gap-0.5 rounded-full border border-white/10 bg-black/20 p-0.5',
        className,
      )}
    >
      {options.map((option) => {
        const pressed = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={pressed}
            aria-label={option.ariaLabel ?? option.label}
            title={option.label}
            onClick={() => onChange(option.value)}
            className={clsx(
              'fl-key rounded-full border-transparent bg-transparent text-caption text-text-muted hover:bg-surface-hover hover:text-text aria-pressed:border-accent/60 aria-pressed:bg-accent-dim aria-pressed:text-accent',
              option.icon ? 'fl-key--icon h-8 w-8 md:h-9 md:w-9' : 'h-8 px-3 md:h-9',
              size === 'md' && 'text-body',
            )}
          >
            {option.icon ?? option.label}
          </button>
        )
      })}
    </div>
  )
}
