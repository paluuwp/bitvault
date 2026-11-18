import { clsx } from 'clsx'
import { useId } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
  leadingIcon?: ReactNode
  containerClassName?: string
}

export function Input({
  label,
  hint,
  error,
  leadingIcon,
  id,
  className,
  containerClassName,
  ...rest
}: InputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const descriptionId = error || hint ? `${inputId}-description` : undefined

  return (
    <div className={clsx('flex w-full flex-col gap-1.5', containerClassName)}>
      {label && (
        <label htmlFor={inputId} className="text-caption text-text-muted">
          {label}
        </label>
      )}
      <div className="relative">
        {leadingIcon && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 flex -translate-y-1/2 items-center text-text-subtle [&_svg]:h-4 [&_svg]:w-4"
          >
            {leadingIcon}
          </span>
        )}
        <input
          {...rest}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={descriptionId}
          className={clsx(
            'h-11 w-full rounded-control border bg-black/25 text-body text-text transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 placeholder:text-text-subtle disabled:cursor-not-allowed disabled:opacity-50',
            leadingIcon ? 'pr-3 pl-10' : 'px-3',
            error
              ? 'border-danger focus:border-danger focus-visible:ring-danger/60'
              : 'border-control-border hover:border-control-border-hover focus:border-accent',
            className,
          )}
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
