import { clsx } from 'clsx'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Spinner } from './Spinner'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'toolbar'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  fullWidth?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-ink hover:bg-accent-hover active:bg-accent-pressed',
  secondary:
    'border border-control-border bg-surface-raised text-text hover:border-control-border-hover hover:bg-surface-hover active:bg-surface-active',
  ghost: 'text-text-muted hover:bg-surface-hover hover:text-text active:bg-surface-active',
  danger: 'bg-danger text-danger-ink hover:bg-danger/90 active:bg-danger/80',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-10 px-3 text-body',
  md: 'h-11 px-4 text-body',
  toolbar: 'h-8 px-3 text-caption pointer-coarse:h-11',
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
        'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-control font-medium transition-[background-color,border-color,color,scale] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50',
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
