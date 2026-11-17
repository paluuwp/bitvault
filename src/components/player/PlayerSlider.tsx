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
        className="relative h-1.5 w-full rounded-chip bg-bg-subtle shadow-sunken"
      >
        <div
          className="absolute inset-y-0 left-0 rounded-chip bg-gradient-to-r from-accent-pressed via-accent to-accent-hover shadow-[0_0_10px_rgb(247_147_30/0.35)]"
          style={{ width: `${percent}%` }}
        >
          {/* Точка на конце дорожки: позиция видна без наведения */}
          <span
            aria-hidden="true"
            className="absolute top-1/2 -right-[3px] h-2 w-2 -translate-y-1/2 rounded-full bg-accent-hover shadow-[0_0_8px_rgb(247_147_30/0.8)]"
          />
        </div>
        <span
          aria-hidden="true"
          className={clsx(
            'absolute top-1/2 h-4 w-2 -translate-x-1/2 -translate-y-1/2 rounded-led border border-accent-ink/40 bg-accent shadow-[0_0_10px_rgb(247_147_30/0.55)] transition-opacity motion-reduce:transition-none',
            dragging
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
          )}
          style={{ left: `${percent}%` }}
        />
      </div>
    </div>
  )
}
