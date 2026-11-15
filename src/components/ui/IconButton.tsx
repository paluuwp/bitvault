import { clsx } from 'clsx'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type IconButtonVariant =
  | 'ghost'
  | 'secondary'
  | 'primary'
  | 'danger'
  | 'play'
  | 'transport'
export type IconButtonSize = 'sm' | 'md'

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  /** Обязательная доступная подпись; она же используется как title-подсказка. */
  label: string
  variant?: IconButtonVariant
  size?: IconButtonSize
  /** Визуальное активное состояние (например, выбранный вид библиотеки). */
  active?: boolean
  tooltip?: string
  children: ReactNode
}

const variantClasses: Record<IconButtonVariant, string> = {
  ghost: 'text-text-muted hover:bg-surface-hover hover:text-text',
  secondary:
    'border border-control-border bg-surface-raised text-text hover:border-control-border-hover hover:bg-surface-hover',
  primary: 'bg-accent text-accent-ink hover:bg-accent-hover active:bg-accent-pressed',
  danger: 'bg-danger text-danger-ink hover:bg-danger/90',
  play: 'bg-play text-play-ink hover:bg-play/90 [&_svg]:fill-current',
  transport:
    'border border-control-border bg-surface-raised text-text shadow-bevel-raised hover:bg-surface-hover',
}

const sizeClasses: Record<IconButtonSize, string> = {
  sm: 'h-10 w-10',
  md: 'h-11 w-11',
}

export function IconButton({
  label,
  variant = 'ghost',
  size = 'sm',
  active = false,
  tooltip,
  className,
  children,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      aria-label={label}
      title={tooltip ?? label}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-control transition-colors disabled:pointer-events-none disabled:opacity-40',
        active ? 'border border-accent/60 bg-accent-dim text-accent' : variantClasses[variant],
        sizeClasses[size],
        className,
      )}
    >
      {children}
    </button>
  )
}
