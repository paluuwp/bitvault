import { clsx } from 'clsx'
import { useId } from 'react'
import type { TextareaHTMLAttributes } from 'react'

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  hint?: string
  error?: string
  containerClassName?: string
}

export function Textarea({
  label,
  hint,
  error,
  id,
  className,
  containerClassName,
  rows = 4,
  ...rest
}: TextareaProps) {
  const generatedId = useId()
  const textareaId = id ?? generatedId
  const descriptionId = error || hint ? `${textareaId}-description` : undefined

  return (
    <div className={clsx('flex w-full flex-col gap-1.5', containerClassName)}>
      {label && (
        <label htmlFor={textareaId} className="text-caption text-text-muted">
          {label}
        </label>
      )}
      <textarea
        {...rest}
        id={textareaId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={descriptionId}
        className={clsx(
          'min-h-24 w-full resize-y rounded-control border bg-bg-subtle/70 px-3 py-2.5 text-body text-text shadow-sunken transition-colors placeholder:text-text-subtle disabled:cursor-not-allowed disabled:opacity-50',
          error
            ? 'border-danger'
            : 'border-control-border hover:border-control-border-hover focus:border-accent',
          className,
        )}
      />
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
