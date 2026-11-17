import { clsx } from 'clsx'

export type LedTone = 'green' | 'amber' | 'red' | 'cyan' | 'accent'

export interface LedProps {
  tone?: LedTone
  size?: 'xs' | 'sm'
  /** false — приглушённая точка без свечения. */
  active?: boolean
  /** Если задана, LED объявляется как изображение с подписью. */
  label?: string
  className?: string
}

const toneClasses: Record<LedTone, string> = {
  green: 'text-led-green',
  amber: 'text-led-amber',
  red: 'text-led-red',
  cyan: 'text-led-cyan',
  accent: 'text-accent',
}

const sizeClasses = {
  xs: 'h-1 w-1',
  sm: 'h-1.5 w-1.5',
} as const

/** Микро-LED в духе FL: декоративный или статусный индикатор. */
export function Led({
  tone = 'green',
  size = 'sm',
  active = true,
  label,
  className,
}: LedProps) {
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={clsx(
        'fl-led shrink-0',
        sizeClasses[size],
        active ? toneClasses[tone] : 'fl-led--off',
        className,
      )}
    />
  )
}
