import { clsx } from 'clsx'
import { Fragment } from 'react'

export interface ReadoutItem {
  label: string
  value: string
  ariaLabel?: string
}

export interface ReadoutProps {
  items: readonly ReadoutItem[]
  variant?: 'inset' | 'overlay' | 'plain'
  size?: 'xs' | 'sm'
  /** Доступная подпись группы; по умолчанию собирается из пар label/value. */
  label?: string
  className?: string
}

const variantClasses = {
  inset: 'fl-inset rounded-control border border-border',
  overlay: 'rounded-chip border border-border bg-bg/85',
  plain: '',
} as const

const sizeClasses = {
  xs: { box: 'gap-2 px-1.5 py-1', value: 'text-mono-badge' },
  sm: { box: 'gap-2.5 px-2 py-1', value: 'text-caption' },
} as const

/** Компактная группа пар «подпись — значение» для BPM, KEY и счётчиков. */
export function Readout({
  items,
  variant = 'inset',
  size = 'sm',
  label,
  className,
}: ReadoutProps) {
  const summary = items
    .map((item) => (item.ariaLabel ?? `${item.label} ${item.value}`))
    .join(', ')

  return (
    <div
      role="group"
      aria-label={label ?? summary}
      className={clsx(
        'inline-flex items-stretch',
        sizeClasses[size].box,
        variantClasses[variant],
        className,
      )}
    >
      {items.map((item, index) => (
        <Fragment key={item.label}>
          {index > 0 && <span aria-hidden="true" className="fl-divider-v" />}
          <span className="inline-flex min-w-0 flex-col justify-center">
            <span
              aria-hidden="true"
              className="text-micro leading-3 font-semibold tracking-[0.14em] text-text-muted uppercase"
            >
              {item.label}
            </span>
            <span
              aria-hidden="true"
              className={clsx(
                'font-mono leading-4 font-semibold tabular-nums text-text',
                sizeClasses[size].value,
              )}
            >
              {item.value}
            </span>
          </span>
        </Fragment>
      ))}
    </div>
  )
}
