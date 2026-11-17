import { clsx } from 'clsx'
import { X } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { IconButton } from './IconButton'

export type ModalSize = 'sm' | 'md' | 'lg'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children?: ReactNode
  footer?: ReactNode
  size?: ModalSize
  closeOnBackdrop?: boolean
  closeLabel?: string
}

const sizeClasses: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
  closeLabel = 'Закрыть окно',
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = description ? `${titleId}-description` : undefined

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open) {
      if (!dialog.open) {
        if (typeof dialog.showModal === 'function') {
          dialog.showModal()
        } else {
          dialog.setAttribute('open', '')
        }
      }
    } else if (dialog.open) {
      if (typeof dialog.close === 'function') {
        dialog.close()
      } else {
        dialog.removeAttribute('open')
      }
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || !open) return

    const handleCancel = (event: Event) => {
      event.preventDefault()
      onClose()
    }

    dialog.addEventListener('cancel', handleCancel)
    return () => dialog.removeEventListener('cancel', handleCancel)
  }, [open, onClose])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-modal="true"
      onClick={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose()
      }}
      className={clsx(
        'm-auto w-[calc(100vw-2rem)] rounded-modal border border-divider bg-surface/95 p-0 text-text shadow-popover backdrop:bg-black/75 backdrop-blur-xl',
        sizeClasses[size],
      )}
    >
      <div className="flex max-h-[85dvh] flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-divider bg-surface-raised px-4 py-3 shadow-bevel">
          <div className="min-w-0">
            <h2 id={titleId} className="text-h1 text-text">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-caption text-text-muted">
                {description}
              </p>
            )}
          </div>
          <IconButton label={closeLabel} variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" aria-hidden="true" />
          </IconButton>
        </header>

        {children && (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
        )}

        {footer && (
          <footer className="flex flex-wrap justify-end gap-2 border-t border-divider bg-bg-subtle px-4 py-3">
            {footer}
          </footer>
        )}
      </div>
    </dialog>
  )
}
