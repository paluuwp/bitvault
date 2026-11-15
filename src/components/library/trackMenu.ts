import type { DropdownMenuItem } from '@/components/ui'
import type { Track } from '@/types/models'

export type TrackMenuAction = 'play' | 'open' | 'favorite' | 'download' | 'delete'

export interface TrackMenuEntry {
  id: TrackMenuAction
  label: string
  variant?: 'danger'
}

/** Базовые пункты меню; динамические подписи собирает `buildTrackMenuItems`. */
export const TRACK_MENU_ENTRIES: TrackMenuEntry[] = [
  { id: 'play', label: 'Слушать' },
  { id: 'open', label: 'Открыть' },
  { id: 'favorite', label: 'В избранное' },
  { id: 'download', label: 'Скачать аудио' },
  { id: 'delete', label: 'Удалить', variant: 'danger' },
]

export function buildTrackMenuItems(
  track: Track,
  onMenuAction?: (track: Track, action: TrackMenuAction) => void,
): DropdownMenuItem[] {
  return TRACK_MENU_ENTRIES.filter(
    (entry) =>
      (entry.id !== 'download' && entry.id !== 'play') || track.audioFileId !== null,
  ).map((entry) => {
    let label = entry.label
    if (entry.id === 'favorite') {
      label = track.isFavorite ? 'Из избранного' : 'В избранное'
    }

    return {
      id: entry.id,
      label,
      variant: entry.variant,
      onSelect: () => onMenuAction?.(track, entry.id),
    }
  })
}
