import { clsx } from 'clsx'
import { Ellipsis } from 'lucide-react'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'

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

interface MenuPosition {
  top: number
  left: number
}

const MENU_GAP = 4
const VIEWPORT_MARGIN = 8

export function DropdownMenu({
  label,
  items,
  trigger,
  triggerClassName = 'text-text-muted hover:bg-surface-hover hover:text-text',
  menuClassName,
  align = 'end',
  placement = 'bottom',
  disabled = false,
  className,
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<MenuPosition | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  /** Фокус первому пункту ставим только после того, как меню перестало быть скрытым. */
  const pendingFocusRef = useRef(false)
  const menuId = useId()

  /**
   * Меню рендерится в portal и позиционируется по окну: у последних строк
   * списка оно не обрезается контейнером и не уходит за нижний край экрана.
   * Если снизу места мало, меню раскрывается вверх.
   */
  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current
    const menu = menuRef.current
    if (!trigger || !menu) return

    const rect = trigger.getBoundingClientRect()
    const menuRect = menu.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    const spaceBelow = viewportHeight - rect.bottom - MENU_GAP - VIEWPORT_MARGIN
    const spaceAbove = rect.top - MENU_GAP - VIEWPORT_MARGIN
    const opensUp =
      placement === 'top'
        ? !(spaceAbove < menuRect.height && spaceBelow > spaceAbove)
        : spaceBelow < menuRect.height && spaceAbove > spaceBelow

    const top = opensUp
      ? Math.max(VIEWPORT_MARGIN, rect.top - MENU_GAP - menuRect.height)
      : Math.min(
          rect.bottom + MENU_GAP,
          viewportHeight - VIEWPORT_MARGIN - menuRect.height,
        )

    const aligned = align === 'end' ? rect.right - menuRect.width : rect.left
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, aligned),
      Math.max(VIEWPORT_MARGIN, viewportWidth - VIEWPORT_MARGIN - menuRect.width),
    )

    const nextTop = Math.max(VIEWPORT_MARGIN, top)
    // Скролл и ресайз срабатывают часто: положение меняем, только если оно другое.
    setPosition((current) =>
      current && current.top === nextTop && current.left === left
        ? current
        : { top: nextTop, left },
    )
  }, [align, placement])

  useLayoutEffect(() => {
    if (!open) return
    updatePosition()
  }, [open, updatePosition])

  useEffect(() => {
    if (!open) return

    const handleViewportChange = () => updatePosition()
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)
    return () => {
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
    }
  }, [open, updatePosition])

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (containerRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setOpen(false)
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
    // Меню спозиционировано, а фокус ещё не поставлен — фокусируем первый пункт.
    if (!open || position === null || !pendingFocusRef.current) return
    pendingFocusRef.current = false
    menuRef.current
      ?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')
      ?.focus()
  }, [open, position])

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const menu = menuRef.current
    if (!menu) return

    const menuItems = Array.from(
      menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'),
    )
    if (menuItems.length === 0) return

    const currentIndex = menuItems.indexOf(document.activeElement as HTMLButtonElement)
    let nextIndex: number
    switch (event.key) {
      case 'ArrowDown':
        nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % menuItems.length
        break
      case 'ArrowUp':
        nextIndex = currentIndex <= 0 ? menuItems.length - 1 : currentIndex - 1
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = menuItems.length - 1
        break
      default:
        return
    }

    event.preventDefault()
    menuItems[nextIndex]?.focus()
  }

  /**
   * Tab перехватываем на обёртке: события из портала всплывают по React-дереву,
   * поэтому сюда попадает и фокус внутри меню, и фокус на триггере, когда
   * доступных пунктов нет. Закрываем меню и оставляем фокус на триггере — иначе
   * портал размонтируется раньше default-действия и браузер уводит фокус
   * в начало или конец страницы.
   */
  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || !open) return
    event.preventDefault()
    setOpen(false)
    triggerRef.current?.focus()
  }

  const menu = open
    ? createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={handleMenuKeyDown}
          style={
            position
              ? { top: position.top, left: position.left }
              : { top: 0, left: 0, visibility: 'hidden' }
          }
          className={clsx(
            'fixed z-50 min-w-44 max-h-[min(20rem,calc(100vh-1rem))] overflow-y-auto animate-scale-in rounded-control border border-hairline bg-surface-raised p-1.5 shadow-popover',
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
                'flex w-full items-center gap-2 rounded-chip px-2.5 py-2.5 text-left text-body transition-colors active:bg-surface-active disabled:pointer-events-none disabled:opacity-40',
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
        </div>,
        document.body,
      )
    : null

  return (
    <div
      ref={containerRef}
      className={clsx('relative inline-flex', className)}
      onKeyDown={handleTabKeyDown}
    >
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          if (!open) pendingFocusRef.current = true
          setPosition(null)
          setOpen((value) => !value)
        }}
        className={clsx(
          'inline-flex h-10 w-10 items-center justify-center rounded-control transition-[background-color,color,transform] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40',
          triggerClassName,
        )}
      >
        {trigger ?? <Ellipsis className="h-5 w-5" aria-hidden="true" />}
      </button>

      {menu}
    </div>
  )
}
