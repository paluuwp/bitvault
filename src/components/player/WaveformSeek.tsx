import { clsx } from 'clsx'
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { DEFAULT_ACCENT, THEME_CHANGE_EVENT } from '@/lib/theme'

export interface WaveformSeekProps {
  value: number
  max: number
  step: number
  label: string
  valueText: string
  disabled?: boolean
  className?: string
  onChange: (value: number) => void
  peaks: number[] | null
  /** Высота волны в px. */
  height?: number
}

const BAR_WIDTH = 2
const BAR_GAP = 1
const IDLE = 'rgba(255, 255, 255, 0.34)'
const IDLE_MIRROR = 'rgba(255, 255, 255, 0.14)'
/** Доля высоты под основную часть; остальное — отражение. */
const MAIN_RATIO = 0.68

/** Читает текущий акцент из CSS-переменных (меняется в настройках). */
function readAccent(): { accent: string; mirror: string } {
  const style = getComputedStyle(document.documentElement)
  const accent = style.getPropertyValue('--color-accent').trim() || DEFAULT_ACCENT
  const rgb = style.getPropertyValue('--accent-rgb').trim() || '247 147 30'
  const [r, g, b] = rgb.split(/\s+/)
  return { accent, mirror: `rgba(${r}, ${g}, ${b}, 0.35)` }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** Ресэмплинг пиков под нужное число столбиков (максимум по окну). */
function resample(peaks: number[] | null, count: number): number[] {
  if (!peaks || peaks.length === 0) return new Array<number>(count).fill(0.12)
  const result = new Array<number>(count)
  const ratio = peaks.length / count
  for (let i = 0; i < count; i += 1) {
    const from = Math.floor(i * ratio)
    const to = Math.max(from + 1, Math.min(peaks.length, Math.ceil((i + 1) * ratio)))
    let max = 0
    for (let j = from; j < to; j += 1) max = Math.max(max, peaks[j] ?? 0)
    result[i] = max
  }
  return result
}

/** Полоса перемотки в виде waveform. Доступность и управление — как у PlayerSlider. */
export function WaveformSeek({
  value,
  max,
  step,
  label,
  valueText,
  disabled = false,
  className,
  onChange,
  peaks,
  height = 30,
}: WaveformSeekProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const draggingRef = useRef(false)
  const [width, setWidth] = useState(0)
  const [themeVersion, setThemeVersion] = useState(0)
  const [dpr, setDpr] = useState(() =>
    typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
  )

  const safeMax = max > 0 ? max : 1
  const clamped = clamp(Number.isFinite(value) ? value : 0, 0, safeMax)
  const ratio = clamped / safeMax

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    setWidth(Math.floor(root.getBoundingClientRect().width))
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setWidth(Math.floor(entry.contentRect.width))
    })
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  // Следим за изменением devicePixelRatio (масштаб страницы, перенос окна между мониторами).
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    let query: MediaQueryList | null = null
    function onChange() {
      setDpr(window.devicePixelRatio || 1)
      subscribe()
    }
    function subscribe() {
      query?.removeEventListener('change', onChange)
      query = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
      query.addEventListener('change', onChange)
    }
    subscribe()
    return () => query?.removeEventListener('change', onChange)
  }, [])

  // Перерисовываем волну при смене акцентного цвета.
  useEffect(() => {
    const onTheme = () => setThemeVersion((v) => v + 1)
    window.addEventListener(THEME_CHANGE_EVENT, onTheme)
    return () => window.removeEventListener(THEME_CHANGE_EVENT, onTheme)
  }, [])

  // Размер буфера меняем только при изменении размеров/dpr: присваивание width/height сбрасывает canvas.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || width <= 0) return
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
  }, [width, height, dpr])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || width <= 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    const count = Math.max(1, Math.floor((width + BAR_GAP) / (BAR_WIDTH + BAR_GAP)))
    const bars = resample(peaks, count)
    const hasPeaks = peaks !== null && peaks.length > 0
    const mainHeight = height * MAIN_RATIO
    const mirrorHeight = height - mainHeight
    const baseline = mainHeight
    const playedX = ratio * width
    const { accent, mirror } = readAccent()

    for (let i = 0; i < count; i += 1) {
      const x = i * (BAR_WIDTH + BAR_GAP)
      const played = x + BAR_WIDTH / 2 <= playedX
      const amp = hasPeaks ? Math.max(0.08, bars[i] ?? 0) : 0.1
      const h = Math.max(2, amp * mainHeight)
      const mh = Math.min(mirrorHeight, Math.max(1, amp * mirrorHeight))

      ctx.fillStyle = played ? accent : IDLE
      ctx.fillRect(x, baseline - h, BAR_WIDTH, h)
      ctx.fillStyle = played ? mirror : IDLE_MIRROR
      ctx.fillRect(x, baseline + 1, BAR_WIDTH, mh)
    }
  }, [peaks, width, height, ratio, dpr, themeVersion])

  const updateFromClientX = (clientX: number) => {
    const rect = rootRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return
    onChange(clamp((clientX - rect.left) / rect.width, 0, 1) * safeMax)
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled) return
    event.preventDefault()
    const target = event.currentTarget
    if (typeof target.setPointerCapture === 'function') {
      try {
        target.setPointerCapture(event.pointerId)
      } catch {
        // Захват указателя не критичен.
      }
    }
    draggingRef.current = true
    updateFromClientX(event.clientX)
  }

  const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    draggingRef.current = false
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
      ref={rootRef}
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
      style={{ height }}
      className={clsx(
        'group relative block touch-none rounded-chip outline-offset-4',
        disabled ? 'cursor-default opacity-50' : 'cursor-pointer',
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{ width: '100%', height }}
        className="pointer-events-none block"
      />
      {/* Курсор текущей позиции */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-0 w-px bg-text/80 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
        style={{ left: `${ratio * 100}%`, height: `${MAIN_RATIO * 100}%` }}
      />
    </div>
  )
}
