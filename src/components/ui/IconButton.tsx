import { clsx } from 'clsx'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type IconButtonVariant =
  | 'ghost'
  | 'secondary'
  | 'primary'
  | 'danger'
  | 'key'
  | 'key-accent'
export type IconButtonSize = 'sm' | 'md' | 'toolbar'

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
  key: 'fl-key fl-key--icon text-text',
  'key-accent': 'fl-key fl-key--accent fl-key--icon text-accent-ink',
}

const sizeClasses: Record<IconButtonSize, string> = {
  sm: 'h-10 w-10',
  md: 'h-11 w-11',
  toolbar: 'h-8 w-8',
}

export function IconButton({
  label,
  variant = 'ghost',
  size = variant === 'key' || variant === 'key-accent' ? 'toolbar' : 'sm',
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
        sizeClasses[size],
        active ? 'border border-accent/60 bg-accent-dim text-accent' : variantClasses[variant],
        className,
      )}
    >
      {children}
    </button>
  )
}
