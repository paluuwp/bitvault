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
          : 'border-hairline bg-surface-raised text-text-muted transition-colors hover:border-border-strong hover:bg-surface-hover',
        className,
      )}
    >
      {children}
    </span>
  )
}
