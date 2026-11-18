/**
 * Доменные модели BitVault.
 *
 * Контракт между слоем данных (`src/lib`) и интерфейсом (`src/hooks`, `src/components`).
 * Изменения типов согласуются через main; исполнители не меняют их самостоятельно.
 */

export type FileKind = 'audio' | 'cover' | 'attachment'

/** Цвета карточки. Значения совпадают с палитрой дизайн-системы. */
export type TrackColor =
  | '#D8FF3E'
  | '#8B5CF6'
  | '#38BDF8'
  | '#FB7185'
  | '#F59E0B'
  | '#34D399'

/** Тональность в нотации FL Studio, например "C#m" или "Bb". */
export type MusicalKey =
  | 'C'
  | 'C#'
  | 'D'
  | 'D#'
  | 'E'
  | 'F'
  | 'F#'
  | 'G'
  | 'G#'
  | 'A'
  | 'A#'
  | 'B'
  | 'Cm'
  | 'C#m'
  | 'Dm'
  | 'D#m'
  | 'Em'
  | 'Fm'
  | 'F#m'
  | 'Gm'
  | 'G#m'
  | 'Am'
  | 'A#m'
  | 'Bm'

export interface Track {
  id: string
  name: string
  /** Служебное поле для индекса и поиска: name в нижнем регистре. */
  nameLower: string
  bpm: number | null
  musicalKey: MusicalKey | null
  /** Автор (исполнитель или продюсер). */
  author: string | null
  genre: string | null
  tags: string[]
  notes: string
  color: TrackColor
  audioFileId: string | null
  coverFileId: string | null
  attachmentFileIds: string[]
  isFavorite: boolean
  durationSec: number | null
  createdAt: string
  updatedAt: string
  lastPlayedAt: string | null
  playCount: number
  /** Трек пришёл из библиотеки аккаунта, а не хранится только на устройстве. */
  source?: 'cloud'
}

export interface StoredFile {
  id: string
  kind: FileKind
  blob: Blob
  mimeType: string
  size: number
  originalName: string
  createdAt: string
  /** Когда файл был загружен в библиотеку аккаунта (если загружался). */
  cloudUploadedAt?: string
  /** Библиотека аккаунта, в которую загружен файл. */
  cloudLibraryId?: string
}

export type NewTrackInput = {
  name: string
  bpm?: number | null
  musicalKey?: MusicalKey | null
  author?: string | null
  genre?: string | null
  tags?: string[]
  notes?: string
  color?: TrackColor
  audioFileId?: string | null
  coverFileId?: string | null
  attachmentFileIds?: string[]
  durationSec?: number | null
  isFavorite?: boolean
}

export type TrackPatch = Partial<
  Pick<
    Track,
    | 'name'
    | 'bpm'
    | 'musicalKey'
    | 'author'
    | 'genre'
    | 'tags'
    | 'notes'
    | 'color'
    | 'coverFileId'
    | 'attachmentFileIds'
    | 'isFavorite'
  >
>

export type TransferPhase = 'prepare' | 'read' | 'write' | 'finish'

export interface TransferProgress {
  phase: TransferPhase
  current: number
  total: number
  label: string
}

export interface ImportIssue {
  /** Имя файла или записи manifest, к которой относится проблема. */
  item: string
  code: string
  message: string
}

export interface ImportResult {
  tracksImported: number
  tracksSkipped: number
  filesImported: number
  errors: ImportIssue[]
  warnings: string[]
}

export interface StorageInfo {
  supported: boolean
  usage: number | null
  quota: number | null
  persisted: boolean
}

export interface FileUrlHandle {
  url: string
  revoke: () => void
}

export type LibraryView = 'grid' | 'list'

export type SortField = 'createdAt' | 'name' | 'bpm' | 'lastPlayedAt'

export type SortDirection = 'asc' | 'desc'

export interface LibraryFilters {
  query: string
  onlyFavorites: boolean
  tag: string | null
  sortField: SortField
  sortDirection: SortDirection
}
