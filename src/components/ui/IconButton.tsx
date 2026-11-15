import { clsx } from 'clsx'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type IconButtonVariant = 'ghost' | 'secondary' | 'primary' | 'danger'
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
  ghost: 'text-text-muted hover:bg-surface hover:text-text',
  secondary: 'border border-border bg-surface text-text hover:bg-surface-hover',
  primary: 'bg-accent text-accent-ink hover:bg-accent/90',
  danger: 'bg-danger text-accent-ink hover:bg-danger/90',
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
        active ? 'bg-surface text-text' : variantClasses[variant],
        sizeClasses[size],
        className,
      )}
    >
      {children}
    </button>
  )
}
