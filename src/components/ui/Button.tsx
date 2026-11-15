import { clsx } from 'clsx'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Spinner } from './Spinner'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  fullWidth?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-ink hover:bg-accent/90 active:bg-accent/80',
  secondary:
    'border border-border bg-surface text-text hover:border-border-strong hover:bg-surface-hover',
  ghost: 'text-text-muted hover:bg-surface hover:text-text',
  danger: 'bg-danger text-accent-ink hover:bg-danger/90 active:bg-danger/80',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-10 px-3 text-body',
  md: 'h-11 px-4 text-body',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  leftIcon,
  rightIcon,
  className,
  children,
  type = 'button',
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-control font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && 'w-full',
        className,
      )}
    >
      {loading ? <Spinner size="sm" label="Загрузка" /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  )
}
