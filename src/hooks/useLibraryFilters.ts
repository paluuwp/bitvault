import { useCallback, useEffect, useMemo, useState } from 'react'
import { STORAGE_KEYS } from '@/lib'
import type { LibraryView, SortDirection, SortField, Track } from '@/types/models'

export interface TagStat {
  name: string
  count: number
}

export interface UseLibraryFiltersResult {
  query: string
  setQuery: (value: string) => void
  onlyFavorites: boolean
  setOnlyFavorites: (value: boolean) => void
  toggleOnlyFavorites: () => void
  tag: string | null
  setTag: (value: string | null) => void
  sortField: SortField
  sortDirection: SortDirection
  setSortField: (field: SortField) => void
  setSortDirection: (direction: SortDirection) => void
  toggleSortDirection: () => void
  view: LibraryView
  setView: (view: LibraryView) => void
  visibleTracks: Track[]
  availableTags: TagStat[]
  hasActiveFilters: boolean
  resetFilters: () => void
}

const SORT_FIELDS: readonly SortField[] = ['createdAt', 'name', 'bpm', 'lastPlayedAt']

const DEFAULT_DIRECTIONS: Record<SortField, SortDirection> = {
  createdAt: 'desc',
  name: 'asc',
  bpm: 'asc',
  lastPlayedAt: 'desc',
}

const nameCollator = new Intl.Collator('ru', { sensitivity: 'base', numeric: true })

function readStorage(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Хранилище может быть недоступно (приватный режим) — настройки просто не запомнятся.
  }
}

function readView(): LibraryView {
  return readStorage(STORAGE_KEYS.view) === 'list' ? 'list' : 'grid'
}

interface SortState {
  field: SortField
  direction: SortDirection
}

function readSort(): SortState {
  const fallback: SortState = { field: 'createdAt', direction: 'desc' }
  const raw = readStorage(STORAGE_KEYS.sort)
  if (!raw) return fallback

  // Поддержка простого значения из ранних версий интерфейса.
  if ((SORT_FIELDS as readonly string[]).includes(raw)) {
    const field = raw as SortField
    return { field, direction: DEFAULT_DIRECTIONS[field] }
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return fallback
    const record = parsed as Record<string, unknown>
    const field =
      typeof record.field === 'string' && (SORT_FIELDS as readonly string[]).includes(record.field)
        ? (record.field as SortField)
        : fallback.field
    const direction =
      record.direction === 'asc' || record.direction === 'desc'
        ? record.direction
        : DEFAULT_DIRECTIONS[field]
    return { field, direction }
  } catch {
    return fallback
  }
}

function applyDirection(result: number, direction: SortDirection): number {
  return direction === 'asc' ? result : -result
}

function compareNullableNumbers(
  left: number | null,
  right: number | null,
  direction: SortDirection,
): number {
  if (left === null && right === null) return 0
  if (left === null) return 1
  if (right === null) return -1
  return applyDirection(left - right, direction)
}

function toTimestamp(value: string | null): number | null {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  return Number.isNaN(timestamp) ? null : timestamp
}

function compareLastPlayed(left: Track, right: Track, direction: SortDirection): number {
  return compareNullableNumbers(
    toTimestamp(left.lastPlayedAt),
    toTimestamp(right.lastPlayedAt),
    direction,
  )
}

function compareTracks(left: Track, right: Track, sort: SortState): number {
  let result = 0
  switch (sort.field) {
    case 'name':
      result = applyDirection(nameCollator.compare(left.name, right.name), sort.direction)
      break
    case 'bpm':
      result = compareNullableNumbers(left.bpm, right.bpm, sort.direction)
      break
    case 'lastPlayedAt':
      result = compareLastPlayed(left, right, sort.direction)
      break
    case 'createdAt':
      result = applyDirection(
        left.createdAt.localeCompare(right.createdAt),
        sort.direction,
      )
      break
  }
  if (result !== 0) return result
  return left.id.localeCompare(right.id)
}

/** Уникальные теги с частотой использования; сначала частые, затем по алфавиту. */
export function buildTagStats(tracks: Track[]): TagStat[] {
  const counters = new Map<string, TagStat>()
  for (const track of tracks) {
    for (const tag of track.tags) {
      const key = tag.toLocaleLowerCase('ru')
      const existing = counters.get(key)
      if (existing) {
        existing.count += 1
      } else {
        counters.set(key, { name: tag, count: 1 })
      }
    }
  }

  return [...counters.values()].sort(
    (left, right) => right.count - left.count || nameCollator.compare(left.name, right.name),
  )
}

export function useLibraryFilters(tracks: Track[]): UseLibraryFiltersResult {
  const [query, setQuery] = useState('')
  const [onlyFavorites, setOnlyFavorites] = useState(false)
  const [tag, setTag] = useState<string | null>(null)
  const [sort, setSort] = useState<SortState>(readSort)
  const [view, setView] = useState<LibraryView>(readView)

  useEffect(() => {
    writeStorage(STORAGE_KEYS.view, view)
  }, [view])

  useEffect(() => {
    writeStorage(STORAGE_KEYS.sort, JSON.stringify(sort))
  }, [sort])

  const setSortField = useCallback((field: SortField) => {
    setSort({ field, direction: DEFAULT_DIRECTIONS[field] })
  }, [])

  const setSortDirection = useCallback((direction: SortDirection) => {
    setSort((previous) => ({ ...previous, direction }))
  }, [])

  const toggleSortDirection = useCallback(() => {
    setSort((previous) => ({
      ...previous,
      direction: previous.direction === 'asc' ? 'desc' : 'asc',
    }))
  }, [])

  const toggleOnlyFavorites = useCallback(() => {
    setOnlyFavorites((previous) => !previous)
  }, [])

  const resetFilters = useCallback(() => {
    setQuery('')
    setOnlyFavorites(false)
    setTag(null)
  }, [])

  const availableTags = useMemo(() => buildTagStats(tracks), [tracks])

  const visibleTracks = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ru')
    const tagKey = tag?.toLocaleLowerCase('ru') ?? null

    const filtered = tracks.filter((track) => {
      if (onlyFavorites && !track.isFavorite) return false

      if (tagKey && !track.tags.some((item) => item.toLocaleLowerCase('ru') === tagKey)) {
        return false
      }

      if (!normalizedQuery) return true

      const haystack = [track.name, track.genre ?? '', ...track.tags]
      return haystack.some((value) =>
        value.toLocaleLowerCase('ru').includes(normalizedQuery),
      )
    })

    return [...filtered].sort((left, right) => compareTracks(left, right, sort))
  }, [onlyFavorites, query, sort, tag, tracks])

  const hasActiveFilters = query.trim() !== '' || onlyFavorites || tag !== null

  return {
    query,
    setQuery,
    onlyFavorites,
    setOnlyFavorites,
    toggleOnlyFavorites,
    tag,
    setTag,
    sortField: sort.field,
    sortDirection: sort.direction,
    setSortField,
    setSortDirection,
    toggleSortDirection,
    view,
    setView,
    visibleTracks,
    availableTags,
    hasActiveFilters,
    resetFilters,
  }
}
