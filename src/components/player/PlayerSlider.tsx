import { clsx } from 'clsx'
import { useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'

export interface PlayerSliderProps {
  value: number
  max: number
  step: number
  label: string
  valueText: string
  disabled?: boolean
  /** `lg` — крупнее бегунок и дорожка (громкость). */
  size?: 'md' | 'lg'
  className?: string
  onChange: (value: number) => void
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** Доступный слайдер с перетаскиванием и управлением с клавиатуры. */
export function PlayerSlider({
  value,
  max,
  step,
  label,
  valueText,
  disabled = false,
  size = 'md',
  className,
  onChange,
}: PlayerSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const [dragging, setDragging] = useState(false)

  const safeMax = max > 0 ? max : 1
  const clamped = clamp(Number.isFinite(value) ? value : 0, 0, safeMax)
  const percent = (clamped / safeMax) * 100

  const updateFromClientX = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1)
    onChange(ratio * safeMax)
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled) return
    event.preventDefault()
    const target = event.currentTarget
    if (typeof target.setPointerCapture === 'function') {
      try {
        target.setPointerCapture(event.pointerId)
      } catch {
        // Захват указателя не критичен для работы слайдера.
      }
    }
    setDragging(true)
    draggingRef.current = true
    updateFromClientX(event.clientX)
  }

  const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    setDragging(false)
    const target = event.currentTarget
    if (
      typeof target.hasPointerCapture === 'function' &&
      target.hasPointerCapture(event.pointerId) &&
      typeof target.releasePointerCapture === 'function'
    ) {
      target.releasePointerCapture(event.pointerId)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return

    let next = clamped
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        next = clamped - step
        break
      case 'ArrowRight':
      case 'ArrowUp':
        next = clamped + step
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = safeMax
        break
      case 'PageDown':
        next = clamped - step * 5
        break
      case 'PageUp':
        next = clamped + step * 5
        break
      default:
        return
    }

    event.preventDefault()
    onChange(clamp(next, 0, safeMax))
  }

  return (
    <div
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={clamped}
      aria-valuetext={valueText}
      aria-disabled={disabled || undefined}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerMove={(event) => {
        if (draggingRef.current) updateFromClientX(event.clientX)
      }}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      className={clsx(
        'player-slider group relative flex h-10 touch-none items-center rounded-chip outline-offset-4 sm:h-6',
        disabled ? 'cursor-default opacity-50' : 'cursor-pointer',
        className,
      )}
    >
      <div
        ref={trackRef}
        className={clsx('relative w-full rounded-full bg-surface-active', size === 'lg' ? 'h-1.5' : 'h-1')}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-accent"
          style={{ width: `${percent}%` }}
        />
        {/* Круглый бегунок: всегда виден, при наведении/перетаскивании увеличивается */}
        <span
          aria-hidden="true"
          className={clsx(
            'absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-text shadow-soft transition-transform motion-reduce:transition-none',
            size === 'lg' ? 'h-4 w-4' : 'h-3 w-3',
            dragging
              ? 'scale-125'
              : 'group-hover:scale-110 group-focus-visible:scale-110',
          )}
          style={{ left: `${percent}%` }}
        />
      </div>
    </div>
  )
}
