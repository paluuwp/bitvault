import { X } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { IconButton } from './IconButton'

export interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children?: ReactNode
  footer?: ReactNode
  closeOnBackdrop?: boolean
  closeLabel?: string
}

export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  closeOnBackdrop = true,
  closeLabel = 'Закрыть панель',
}: DrawerProps) {
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
      className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-full max-w-[440px] border-l border-border bg-surface p-0 text-text backdrop:bg-bg/80 backdrop:backdrop-blur-sm"
    >
      <div className="flex h-full flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
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

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <footer className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </dialog>
  )
}
