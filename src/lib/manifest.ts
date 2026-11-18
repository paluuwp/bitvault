import type { FileKind, MusicalKey, StoredFile, Track, TrackColor } from '@/types/models'
import {
  DEFAULT_TRACK_COLOR,
  FILES_DIR,
  LIMITS,
  MANIFEST_APP,
  MANIFEST_SCHEMA_VERSION,
} from './constants'
import { AppError } from './errors'
import { formatBytes } from './format'
import { getFileExtension } from './audio'

export interface ManifestFile {
  id: string
  kind: FileKind
  /** Относительный путь внутри архива, например `files/<id>.wav`. */
  path: string
  mimeType: string
  size: number
  originalName: string
  createdAt: string
}

export interface ManifestTrack {
  id: string
  name: string
  bpm: number | null
  musicalKey: MusicalKey | null
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
}

export interface ExportManifest {
  app: typeof MANIFEST_APP
  schemaVersion: typeof MANIFEST_SCHEMA_VERSION
  exportedAt: string
  tracks: ManifestTrack[]
  files: ManifestFile[]
}

function invalid(message?: string): never {
  throw new AppError('IMPORT_INVALID_MANIFEST', message)
}

function requireString(value: unknown, message: string): string {
  if (typeof value !== 'string') invalid(message)
  return value
}

function requireNonEmptyString(value: unknown, message: string): string {
  const result = requireString(value, message).trim()
  if (!result) invalid(message)
  return result
}

function readNullableId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const values: unknown[] = value
  return values.filter((item): item is string => typeof item === 'string')
}

/** Идентификаторы попадают в пути архива, поэтому допускаются только безопасные символы. */
const SAFE_FILE_ID = /^[A-Za-z0-9_-]{1,128}$/
const SAFE_TRACK_ID_MAX = 128
/** Расширение из имени файла не должно ломать путь внутри архива. */
const SAFE_EXTENSION = /^[a-z0-9]{1,8}$/
const ORIGINAL_NAME_MAX = 200

function sanitizeOriginalName(value: unknown, fallback: string): string {
  const raw = typeof value === 'string' ? value : ''
  const basename = raw.split(/[\\/]/).pop() ?? ''
  const cleaned = Array.from(basename)
    .filter((char) => {
      const code = char.charCodeAt(0)
      if (code < 0x20 || code === 0x7f) return false
      // Bidi-управляющие и zero-width символы позволяют подделать имя файла.
      if (code >= 0x200b && code <= 0x200f) return false
      if (code >= 0x202a && code <= 0x202e) return false
      if (code >= 0x2060 && code <= 0x2064) return false
      if (code >= 0x2066 && code <= 0x2069) return false
      if (code === 0xfeff) return false
      return true
    })
    .join('')
    .trim()
    .slice(0, ORIGINAL_NAME_MAX)
    .trim()
  if (!cleaned || /^\.+$/.test(cleaned)) return fallback
  return cleaned
}

function readManifestTrack(value: unknown, index: number): ManifestTrack {
  if (typeof value !== 'object' || value === null) {
    invalid(`Запись трека #${index + 1} имеет неверный формат.`)
  }
  const record = value as Record<string, unknown>
  const id = requireNonEmptyString(
    record.id,
    `Запись трека #${index + 1} не содержит идентификатора.`,
  )
  if (id.length > SAFE_TRACK_ID_MAX) {
    invalid(`Идентификатор трека #${index + 1} слишком длинный.`)
  }
  const name = requireString(record.name, `Запись трека «${id}» не содержит названия.`)
  const createdAt =
    typeof record.createdAt === 'string' && record.createdAt
      ? record.createdAt
      : new Date().toISOString()
  const attachmentFileIds = readStringArray(record.attachmentFileIds).filter(
    (fileId) => fileId.trim() !== '',
  )
  if (attachmentFileIds.length > LIMITS.attachmentsMax) {
    invalid(`У трека «${id}» больше ${LIMITS.attachmentsMax} вложений.`)
  }

  return {
    id,
    name,
    bpm: typeof record.bpm === 'number' && Number.isFinite(record.bpm) ? record.bpm : null,
    musicalKey:
      typeof record.musicalKey === 'string' ? (record.musicalKey as MusicalKey) : null,
    author: typeof record.author === 'string' ? record.author : null,
    genre: typeof record.genre === 'string' ? record.genre : null,
    tags: readStringArray(record.tags),
    notes: typeof record.notes === 'string' ? record.notes : '',
    color: typeof record.color === 'string' ? (record.color as TrackColor) : DEFAULT_TRACK_COLOR,
    audioFileId: readNullableId(record.audioFileId),
    coverFileId: readNullableId(record.coverFileId),
    attachmentFileIds,
    isFavorite: record.isFavorite === true,
    durationSec:
      typeof record.durationSec === 'number' && Number.isFinite(record.durationSec)
        ? record.durationSec
        : null,
    createdAt,
    updatedAt:
      typeof record.updatedAt === 'string' && record.updatedAt
        ? record.updatedAt
        : createdAt,
    lastPlayedAt:
      typeof record.lastPlayedAt === 'string' && record.lastPlayedAt
        ? record.lastPlayedAt
        : null,
    playCount:
      typeof record.playCount === 'number' && Number.isFinite(record.playCount)
        ? Math.max(0, Math.floor(record.playCount))
        : 0,
  }
}

function readManifestFile(value: unknown, index: number): ManifestFile {
  if (typeof value !== 'object' || value === null) {
    invalid(`Запись файла #${index + 1} имеет неверный формат.`)
  }
  const record = value as Record<string, unknown>
  const id = requireNonEmptyString(
    record.id,
    `Запись файла #${index + 1} не содержит идентификатора.`,
  )
  // id участвует в пути записи ZIP: посторонние символы здесь недопустимы.
  if (!SAFE_FILE_ID.test(id)) {
    invalid(`Идентификатор файла «${id}» содержит недопустимые символы.`)
  }
  const kind = record.kind
  if (kind !== 'audio' && kind !== 'cover' && kind !== 'attachment') {
    invalid(`Файл «${id}» имеет неверный тип.`)
  }
  const fileKind = kind as FileKind
  const path = requireNonEmptyString(record.path, `Файл «${id}» не содержит пути.`)
  if (!isSafeArchivePath(path) || !path.startsWith(`${FILES_DIR}/`)) {
    invalid(`Недопустимый путь файла в манифесте: «${path}».`)
  }

  return {
    id,
    kind: fileKind,
    path,
    mimeType: typeof record.mimeType === 'string' ? record.mimeType : '',
    size:
      typeof record.size === 'number' && Number.isFinite(record.size) && record.size >= 0
        ? record.size
        : 0,
    originalName: sanitizeOriginalName(record.originalName, path.split('/').pop() ?? 'file'),
    createdAt:
      typeof record.createdAt === 'string' && record.createdAt
        ? record.createdAt
        : new Date().toISOString(),
  }
}

/** Запрещает абсолютные пути, обратные слэши, `.` и `..` в сегментах. */
export function isSafeArchivePath(path: unknown): boolean {
  if (typeof path !== 'string' || path.length === 0) return false
  if (path !== path.trim()) return false
  if (path.includes('\\') || path.includes('\0')) return false
  if (path.startsWith('/')) return false
  if (/^[a-zA-Z]:/.test(path)) return false
  return path
    .split('/')
    .every((segment) => segment !== '' && segment !== '.' && segment !== '..')
}

export function validateManifest(value: unknown): ExportManifest {
  if (typeof value !== 'object' || value === null) invalid()
  const record = value as Record<string, unknown>

  if (record.app !== MANIFEST_APP) {
    invalid('Файл не является экспортом BitVault.')
  }
  const schemaVersion = record.schemaVersion
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion)) {
    invalid('В манифесте не указана версия схемы.')
  }
  if (schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    throw new AppError(
      'IMPORT_VERSION_UNSUPPORTED',
      `Версия архива ${schemaVersion} не поддерживается.`,
    )
  }

  const tracksValue = record.tracks
  const filesValue = record.files
  if (!Array.isArray(tracksValue) || !Array.isArray(filesValue)) {
    invalid('Манифест не содержит списки треков и файлов.')
  }
  const rawTracks = tracksValue as unknown[]
  const rawFiles = filesValue as unknown[]

  if (rawFiles.length > LIMITS.importFilesMax) {
    throw new AppError(
      'IMPORT_LIMIT_EXCEEDED',
      `В архиве больше ${LIMITS.importFilesMax} файлов.`,
    )
  }
  if (rawTracks.length > LIMITS.importTracksMax) {
    throw new AppError(
      'IMPORT_LIMIT_EXCEEDED',
      `В архиве больше ${LIMITS.importTracksMax} треков.`,
    )
  }

  const tracks = rawTracks.map((item, index) => readManifestTrack(item, index))
  const files = rawFiles.map((item, index) => readManifestFile(item, index))

  const trackIds = new Set<string>()
  for (const track of tracks) {
    if (trackIds.has(track.id)) invalid(`Повторяющийся идентификатор трека: «${track.id}».`)
    trackIds.add(track.id)
  }

  const fileIds = new Set<string>()
  const filePaths = new Set<string>()
  const exportPaths = new Set<string>()
  let totalSize = 0
  for (const file of files) {
    if (fileIds.has(file.id)) invalid(`Повторяющийся идентификатор файла: «${file.id}».`)
    if (filePaths.has(file.path)) invalid(`Повторяющийся путь файла: «${file.path}».`)
    fileIds.add(file.id)
    filePaths.add(file.path)

    // Путь экспорта строится из id и расширения: он тоже должен быть безопасным и уникальным,
    // иначе резервную копию нельзя будет импортировать обратно.
    const generatedPath = fileArchivePath(file)
    if (!isSafeArchivePath(generatedPath)) {
      invalid(`Недопустимый путь файла при экспорте: «${generatedPath}».`)
    }
    if (exportPaths.has(generatedPath)) {
      invalid(`Файлы с одинаковым путём при экспорте: «${generatedPath}».`)
    }
    exportPaths.add(generatedPath)

    totalSize += file.size
  }
  if (totalSize > LIMITS.importTotalMaxBytes) {
    throw new AppError(
      'IMPORT_LIMIT_EXCEEDED',
      `Размер файлов в архиве превышает ${formatBytes(LIMITS.importTotalMaxBytes)}.`,
    )
  }

  return {
    app: MANIFEST_APP,
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    exportedAt:
      typeof record.exportedAt === 'string' && record.exportedAt
        ? record.exportedAt
        : new Date().toISOString(),
    tracks,
    files,
  }
}

export function parseManifest(json: string): ExportManifest {
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch (error) {
    throw new AppError('IMPORT_INVALID_MANIFEST', 'Не удалось прочитать manifest.json.', {
      cause: error,
    })
  }
  return validateManifest(value)
}

export function trackToManifest(track: Track): ManifestTrack {
  return {
    id: track.id,
    name: track.name,
    bpm: track.bpm,
    musicalKey: track.musicalKey,
    author: track.author ?? null,
    genre: track.genre,
    tags: [...track.tags],
    notes: track.notes,
    color: track.color,
    audioFileId: track.audioFileId,
    coverFileId: track.coverFileId,
    attachmentFileIds: [...track.attachmentFileIds],
    isFavorite: track.isFavorite,
    durationSec: track.durationSec,
    createdAt: track.createdAt,
    updatedAt: track.updatedAt,
    lastPlayedAt: track.lastPlayedAt,
    playCount: track.playCount,
  }
}

export function fileArchivePath(file: Pick<StoredFile, 'id' | 'originalName'>): string {
  if (!SAFE_FILE_ID.test(file.id)) {
    throw new AppError(
      'EXPORT_FAILED',
      `Идентификатор файла «${file.id}» нельзя использовать в архиве.`,
    )
  }
  const extension = getFileExtension(file.originalName).toLowerCase()
  const suffix = SAFE_EXTENSION.test(extension) ? `.${extension}` : ''
  return `${FILES_DIR}/${file.id}${suffix}`
}

export function buildManifest(
  tracks: Track[],
  files: StoredFile[],
  exportedAt: Date = new Date(),
): ExportManifest {
  const paths = new Set<string>()
  const manifestFiles = files.map((file) => {
    const path = fileArchivePath(file)
    if (paths.has(path)) {
      throw new AppError('EXPORT_FAILED', `Файлы с одинаковым путём в архиве: «${path}».`)
    }
    paths.add(path)
    return {
      id: file.id,
      kind: file.kind,
      path,
      mimeType: file.mimeType,
      size: file.size,
      originalName: file.originalName,
      createdAt: file.createdAt,
    }
  })

  return {
    app: MANIFEST_APP,
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    exportedAt: exportedAt.toISOString(),
    tracks: tracks.map(trackToManifest),
    files: manifestFiles,
  }
}
