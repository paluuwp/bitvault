import { clsx } from 'clsx'
import type { ReactNode } from 'react'

export interface EmptyStateProps {
  title: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center rounded-card border border-border bg-surface px-6 py-12 text-center shadow-bevel',
        className,
      )}
    >
      {icon && (
        <span
          aria-hidden="true"
          className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-chip border border-border bg-surface-raised text-text-muted"
        >
          {icon}
        </span>
      )}
      <h2 className="text-h2 text-text">{title}</h2>
      {description && (
        <p className="mt-1.5 max-w-sm text-body text-text-muted">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
