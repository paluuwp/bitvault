const PLACEHOLDER = '—'

const BYTE_UNITS = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'] as const

export function safeTrim(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim()
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** Длительность в формате `mm:ss`, для часа и больше — `h:mm:ss`. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return PLACEHOLDER
  }
  const total = Math.round(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const rest = total % 60
  if (hours > 0) return `${hours}:${pad2(minutes)}:${pad2(rest)}`
  return `${pad2(minutes)}:${pad2(rest)}`
}

/** Размер в байтах с русскими сокращениями (`Б`, `КБ`, `МБ`, `ГБ`). */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) {
    return PLACEHOLDER
  }
  if (bytes < 1024) return `${Math.round(bytes)} Б`
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  const formatted = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value)
  return `${formatted} ${BYTE_UNITS[unitIndex]}`
}

function toLocalDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined) return null
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** Дата: «Сегодня», «Вчера» или `ДД.ММ.ГГГГ`. */
export function formatDate(value: string | Date | null | undefined, now: Date = new Date()): string {
  const date = toLocalDate(value)
  if (!date) return PLACEHOLDER
  const diffDays = Math.round((startOfLocalDay(now) - startOfLocalDay(date)) / 86_400_000)
  if (diffDays === 0) return 'Сегодня'
  if (diffDays === 1) return 'Вчера'
  return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${date.getFullYear()}`
}

function pluralRu(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

/** Количество прослушиваний с правильным русским склонением. */
export function formatPlayCount(count: number | null | undefined): string {
  const value = count === null || count === undefined || !Number.isFinite(count) || count < 0 ? 0 : Math.floor(count)
  const word = pluralRu(value, 'прослушивание', 'прослушивания', 'прослушиваний')
  return `${value} ${word}`
}
