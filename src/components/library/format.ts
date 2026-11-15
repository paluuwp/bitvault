import type { TrackColor } from '@/types/models'

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
})

const coverGradients: Record<TrackColor, readonly [string, string]> = {
  '#D8FF3E': ['--color-cover-lime', '--color-cover-emerald'],
  '#8B5CF6': ['--color-cover-violet', '--color-cover-cyan'],
  '#38BDF8': ['--color-cover-cyan', '--color-cover-violet'],
  '#FB7185': ['--color-cover-rose', '--color-cover-amber'],
  '#F59E0B': ['--color-cover-amber', '--color-cover-rose'],
  '#34D399': ['--color-cover-emerald', '--color-cover-lime'],
}

export function getCoverGradient(color: TrackColor): string {
  const [from, to] = coverGradients[color]
  return `linear-gradient(140deg, var(${from}) 0%, var(${to}) 100%)`
}

export function getCoverLetter(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '•'
  return Array.from(trimmed)[0]?.toUpperCase() ?? '•'
}

export function formatDuration(durationSec: number | null): string {
  if (durationSec === null || !Number.isFinite(durationSec) || durationSec < 0) return '—:—'
  const total = Math.round(durationSec)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function formatTrackDate(isoDate: string): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return 'Без даты'
  return dateFormatter.format(date)
}

export function formatTrackCount(count: number): string {
  const mod10 = count % 10
  const mod100 = count % 100

  let noun = 'битов'
  if (mod10 === 1 && mod100 !== 11) {
    noun = 'бит'
  } else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    noun = 'бита'
  }

  return `${count} ${noun}`
}
