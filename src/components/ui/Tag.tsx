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
        'inline-flex max-w-full items-center truncate rounded-full border px-2.5 py-0.5 text-caption whitespace-nowrap',
        active
          ? 'border-accent/40 bg-accent/10 text-accent'
          : 'border-border bg-bg-subtle text-text-muted',
        className,
      )}
    >
      {children}
    </span>
  )
}
