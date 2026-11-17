import { clsx } from 'clsx'
import type { ReactNode } from 'react'

export interface ToolbarGroupProps {
  /** Подпись группы для скринридеров; визуально не показывается. */
  label?: string
  /** Вертикальный разделитель слева; у первой группы в полосе его нет. */
  divider?: boolean
  grow?: boolean
  className?: string
  children: ReactNode
}

/** Группа клавиш в плотной тулбар-полосе. */
export function ToolbarGroup({
  label,
  divider = true,
  grow = false,
  className,
  children,
}: ToolbarGroupProps) {
  return (
    <div
      role={label ? 'group' : undefined}
      aria-label={label}
      className={clsx(
        'flex min-w-0 items-center gap-1 py-1 first:pl-0 last:pr-0',
        divider ? 'border-l border-divider pl-2 first:border-l-0 first:pl-0' : 'px-1',
        grow && 'min-w-0 flex-1',
        className,
      )}
    >
      {children}
    </div>
  )
}
