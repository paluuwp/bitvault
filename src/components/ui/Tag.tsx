import { clsx } from 'clsx'
import type { ReactNode } from 'react'

export interface TagProps {
  children: ReactNode
  active?: boolean
  className?: string
}

export function Tag({ children, active = false, className }: TagProps) {
  return (
    <span
      className={clsx(
        'inline-flex max-w-full items-center truncate rounded-chip border px-2 py-0.5 text-caption whitespace-nowrap',
        active
          ? 'border-accent bg-accent/10 text-accent'
          : 'border-divider bg-surface text-text-muted hover:border-key-border hover:bg-surface-raised',
        className,
      )}
    >
      {children}
    </span>
  )
}
