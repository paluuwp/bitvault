import { clsx } from 'clsx'
import { ChevronDown } from 'lucide-react'
import { useId } from 'react'
import type { ReactNode, SelectHTMLAttributes } from 'react'

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  hint?: string
  error?: string
  containerClassName?: string
  children: ReactNode
}

export function Select({
  label,
  hint,
  error,
  id,
  className,
  containerClassName,
  children,
  ...rest
}: SelectProps) {
  const generatedId = useId()
  const selectId = id ?? generatedId
  const descriptionId = error || hint ? `${selectId}-description` : undefined

  return (
    <div className={clsx('flex flex-col gap-1.5', containerClassName ?? 'w-full')}>
      {label && (
        <label htmlFor={selectId} className="text-caption text-text-muted">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          {...rest}
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={descriptionId}
          className={clsx(
            'h-11 w-full appearance-none rounded-control border bg-bg-subtle pr-9 pl-3 text-body text-text shadow-sunken transition-colors disabled:cursor-not-allowed disabled:opacity-50',
            error
              ? 'border-danger'
              : 'border-control-border hover:border-control-border-hover focus:border-accent',
            className,
          )}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-text-subtle"
        />
      </div>
      {descriptionId && (
        <p
          id={descriptionId}
          role={error ? 'alert' : undefined}
          className={clsx('text-caption', error ? 'text-danger' : 'text-text-muted')}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  )
}
