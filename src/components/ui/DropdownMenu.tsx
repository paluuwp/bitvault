import { clsx } from 'clsx'
import { Ellipsis } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'

export interface DropdownMenuItem {
  id: string
  label: string
  icon?: ReactNode
  onSelect?: () => void
  disabled?: boolean
  variant?: 'default' | 'danger'
}

export interface DropdownMenuProps {
  /** Доступная подпись кнопки-триггера и меню. */
  label: string
  items: DropdownMenuItem[]
  trigger?: ReactNode
  triggerClassName?: string
  menuClassName?: string
  align?: 'start' | 'end'
  placement?: 'bottom' | 'top'
  disabled?: boolean
  className?: string
}

export function DropdownMenu({
  label,
  items,
  trigger,
  triggerClassName = 'text-text-muted hover:bg-surface hover:text-text',
  menuClassName,
  align = 'end',
  placement = 'bottom',
  disabled = false,
  className,
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!containerRef.current?.contains(target)) {
        setOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    menuRef.current
      ?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')
      ?.focus()
  }, [open])

  return (
    <div ref={containerRef} className={clsx('relative inline-flex', className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        className={clsx(
          'inline-flex h-10 w-10 items-center justify-center rounded-control transition-colors disabled:pointer-events-none disabled:opacity-40',
          triggerClassName,
        )}
      >
        {trigger ?? <Ellipsis className="h-5 w-5" aria-hidden="true" />}
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          className={clsx(
            'absolute z-30 min-w-44 overflow-hidden rounded-control border border-border bg-surface p-1',
            align === 'end' ? 'right-0' : 'left-0',
            placement === 'top' ? 'bottom-full mb-1' : 'top-full mt-1',
            menuClassName,
          )}
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                if (item.disabled) return
                item.onSelect?.()
                setOpen(false)
                triggerRef.current?.focus()
              }}
              className={clsx(
                'flex w-full items-center gap-2 rounded-md px-2.5 py-2.5 text-left text-body transition-colors disabled:pointer-events-none disabled:opacity-40',
                item.variant === 'danger'
                  ? 'text-danger hover:bg-danger/10'
                  : 'text-text-muted hover:bg-surface-hover hover:text-text',
              )}
            >
              {item.icon && (
                <span aria-hidden="true" className="[&_svg]:h-4 [&_svg]:w-4">
                  {item.icon}
                </span>
              )}
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
