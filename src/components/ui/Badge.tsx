import { clsx } from 'clsx'
import type { ReactNode } from 'react'

export type BadgeVariant = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'overlay'

export interface BadgeProps {
  children: ReactNode
  variant?: BadgeVariant
  /** Моноширинный бейдж для BPM и длительности. */
  mono?: boolean
  className?: string
}

const variantClasses: Record<BadgeVariant, string> = {
  neutral: 'border border-border bg-surface text-text-muted',
  accent: 'bg-accent text-accent-ink',
  success: 'border border-cover-emerald/30 bg-cover-emerald/15 text-cover-emerald',
  warning: 'border border-warning/30 bg-warning/15 text-warning',
  danger: 'border border-danger/30 bg-danger/15 text-danger',
  info: 'border border-info/30 bg-info/15 text-info',
  overlay: 'bg-bg/70 text-text backdrop-blur-sm',
}

export function Badge({ children, variant = 'neutral', mono = false, className }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center justify-center rounded-full px-2 py-0.5 whitespace-nowrap',
        mono ? 'font-mono text-mono-badge uppercase' : 'text-caption',
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </span>
  )
}
