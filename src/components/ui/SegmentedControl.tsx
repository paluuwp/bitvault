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
        'inline-flex shrink-0 items-center gap-0.5 rounded-full border border-key-border bg-groove p-0.5',
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
              'fl-key rounded-full text-caption',
              option.icon ? 'fl-key--icon h-8 w-8' : 'h-8 px-2.5',
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
