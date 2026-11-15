import type { FileKind, MusicalKey, NewTrackInput, TrackColor, TrackPatch } from '@/types/models'
import {
  DEFAULT_TRACK_COLOR,
  IMAGE_EXTENSIONS,
  IMAGE_MIME_TYPES,
  LIMITS,
  MUSICAL_KEYS,
  TRACK_COLORS,
} from './constants'
import { AppError } from './errors'
import { formatBytes } from './format'
import { getFileExtension, isAudioFile, normalizeMimeType } from './audio'

export interface FileMetadata {
  name: string
  type: string
  size: number
}

export interface ValidatedFile {
  kind: FileKind
  mimeType: string
  extension: string
}

export interface NormalizedNewTrack {
  name: string
  bpm: number | null
  musicalKey: MusicalKey | null
  genre: string | null
  tags: string[]
  notes: string
  color: TrackColor
  audioFileId: string | null
  coverFileId: string | null
  attachmentFileIds: string[]
  durationSec: number | null
  isFavorite: boolean
}

export interface NormalizedImportedTrack {
  id: string | null
  name: string
  bpm: number | null
  musicalKey: MusicalKey | null
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

export interface ImportedTrackNormalization {
  track: NormalizedImportedTrack
  warnings: string[]
}

function fail(message: string): never {
  throw new AppError('VALIDATION', message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function matchMusicalKey(value: unknown): MusicalKey | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return (MUSICAL_KEYS as readonly string[]).includes(trimmed) ? (trimmed as MusicalKey) : null
}

function normalizeTrackName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : ''
  if (name.length < LIMITS.nameMin) fail('Введите название трека.')
  if (name.length > LIMITS.nameMax) fail(`Название не должно превышать ${LIMITS.nameMax} символов.`)
  return name
}

function normalizeBpm(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = parseNumber(value)
  if (parsed === null) fail(`BPM должен быть числом от ${LIMITS.bpmMin} до ${LIMITS.bpmMax}.`)
  if (!Number.isInteger(parsed)) fail('BPM должен быть целым числом.')
  if (parsed < LIMITS.bpmMin || parsed > LIMITS.bpmMax) {
    fail(`BPM должен быть от ${LIMITS.bpmMin} до ${LIMITS.bpmMax}.`)
  }
  return parsed
}

function normalizeMusicalKey(value: unknown): MusicalKey | null {
  if (value === null || value === undefined || value === '') return null
  const matched = matchMusicalKey(value)
  if (!matched) fail('Выберите тональность из списка.')
  return matched
}

function normalizeGenre(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') fail('Жанр должен быть строкой.')
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.length > LIMITS.genreMax) fail(`Жанр не должен превышать ${LIMITS.genreMax} символов.`)
  return trimmed
}

function normalizeNotes(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value !== 'string') fail('Заметки должны быть строкой.')
  const trimmed = value.trim()
  if (trimmed.length > LIMITS.notesMax) fail(`Заметки не должны превышать ${LIMITS.notesMax} символов.`)
  return trimmed
}

function normalizeColor(value: unknown): TrackColor {
  if (value === null || value === undefined || value === '') return DEFAULT_TRACK_COLOR
  if (typeof value === 'string' && (TRACK_COLORS as readonly string[]).includes(value)) {
    return value as TrackColor
  }
  fail('Выберите цвет из палитры.')
}

function normalizeFileId(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') fail(`Некорректная ссылка на файл (${field}).`)
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function normalizeFileIds(value: unknown): string[] {
  if (value === null || value === undefined) return []
  if (!Array.isArray(value)) fail('Некорректный список вложений.')
  const values: unknown[] = value
  const result: string[] = []
  for (const item of values) {
    if (typeof item !== 'string') fail('Некорректный список вложений.')
    const trimmed = item.trim()
    if (trimmed && !result.includes(trimmed)) result.push(trimmed)
    if (result.length >= LIMITS.attachmentsMax) break
  }
  return result
}

function normalizeDuration(value: unknown): number | null {
  const parsed = parseNumber(value)
  if (parsed === null || parsed < 0) return null
  return parsed
}

/** Обрезает решётку, пробелы, дубли и лишние теги. Не бросает ошибок — пригодно для импорта. */
export function sanitizeTags(input: unknown): string[] {
  let values: unknown[]
  if (typeof input === 'string') {
    values = input.split(',')
  } else if (Array.isArray(input)) {
    values = input
  } else {
    return []
  }

  const result: string[] = []
  const seen = new Set<string>()
  for (const item of values) {
    if (typeof item !== 'string') continue
    let tag = item.trim()
    while (tag.startsWith('#')) tag = tag.slice(1).trim()
    if (!tag) continue
    tag = tag.slice(0, LIMITS.tagLengthMax).trim()
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(tag)
    if (result.length >= LIMITS.tagsMax) break
  }
  return result
}

export function normalizeNewTrack(input: NewTrackInput): NormalizedNewTrack {
  const source: unknown = input
  if (!isRecord(source)) fail('Некорректные данные трека.')
  const record = source as NewTrackInput
  return {
    name: normalizeTrackName(record.name),
    bpm: normalizeBpm(record.bpm),
    musicalKey: normalizeMusicalKey(record.musicalKey),
    genre: normalizeGenre(record.genre),
    tags: sanitizeTags(record.tags),
    notes: normalizeNotes(record.notes),
    color: normalizeColor(record.color),
    audioFileId: normalizeFileId(record.audioFileId, 'audioFileId'),
    coverFileId: normalizeFileId(record.coverFileId, 'coverFileId'),
    attachmentFileIds: normalizeFileIds(record.attachmentFileIds),
    durationSec: normalizeDuration(record.durationSec),
    isFavorite: record.isFavorite === true,
  }
}

export function normalizePatch(patch: TrackPatch): TrackPatch {
  const source: unknown = patch
  if (!isRecord(source)) fail('Некорректные данные трека.')
  const record = source as TrackPatch
  const result: TrackPatch = {}
  if ('name' in record) result.name = normalizeTrackName(record.name)
  if ('bpm' in record) result.bpm = normalizeBpm(record.bpm)
  if ('musicalKey' in record) result.musicalKey = normalizeMusicalKey(record.musicalKey)
  if ('genre' in record) result.genre = normalizeGenre(record.genre)
  if ('tags' in record) result.tags = sanitizeTags(record.tags)
  if ('notes' in record) result.notes = normalizeNotes(record.notes)
  if ('color' in record) result.color = normalizeColor(record.color)
  if ('coverFileId' in record) result.coverFileId = normalizeFileId(record.coverFileId, 'coverFileId')
  if ('attachmentFileIds' in record) {
    result.attachmentFileIds = normalizeFileIds(record.attachmentFileIds)
  }
  if ('isFavorite' in record) result.isFavorite = record.isFavorite === true
  return result
}

export function isSupportedImageFile(file: FileMetadata): boolean {
  const mime = normalizeMimeType(file.type)
  return IMAGE_MIME_TYPES.includes(mime) || IMAGE_EXTENSIONS.includes(getFileExtension(file.name))
}

export function validateAudioFile(file: FileMetadata): ValidatedFile {
  if (!isAudioFile(file)) {
    throw new AppError(
      'UNSUPPORTED_AUDIO',
      `Формат файла «${file.name.trim() || 'без имени'}» не поддерживается.`,
    )
  }
  if (file.size > LIMITS.audioFileMaxBytes) {
    throw new AppError('FILE_TOO_LARGE', `Аудиофайл больше ${formatBytes(LIMITS.audioFileMaxBytes)}.`)
  }
  return {
    kind: 'audio',
    mimeType: normalizeMimeType(file.type),
    extension: getFileExtension(file.name),
  }
}

export function validateCoverFile(file: FileMetadata): ValidatedFile {
  if (!isSupportedImageFile(file)) {
    throw new AppError(
      'UNSUPPORTED_IMAGE',
      `Формат файла «${file.name.trim() || 'без имени'}» не поддерживается как обложка.`,
    )
  }
  if (file.size > LIMITS.coverFileMaxBytes) {
    throw new AppError('FILE_TOO_LARGE', `Обложка больше ${formatBytes(LIMITS.coverFileMaxBytes)}.`)
  }
  return {
    kind: 'cover',
    mimeType: normalizeMimeType(file.type),
    extension: getFileExtension(file.name),
  }
}

export function validateAttachmentFile(file: FileMetadata): ValidatedFile {
  if (!file.name.trim()) fail('У файла нет имени.')
  if (file.size > LIMITS.attachmentFileMaxBytes) {
    throw new AppError(
      'FILE_TOO_LARGE',
      `Файл больше ${formatBytes(LIMITS.attachmentFileMaxBytes)}.`,
    )
  }
  return {
    kind: 'attachment',
    mimeType: normalizeMimeType(file.type),
    extension: getFileExtension(file.name),
  }
}

function lenientNumber(value: unknown): number | null {
  return parseNumber(value)
}

function lenientStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const values: unknown[] = value
  const result: string[] = []
  for (const item of values) {
    if (typeof item !== 'string') continue
    const trimmed = item.trim()
    if (trimmed && !result.includes(trimmed)) result.push(trimmed)
  }
  return result
}

function lenientFileId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function normalizeImportedBpm(value: unknown, name: string, warnings: string[]): number | null {
  const parsed = lenientNumber(value)
  if (parsed === null) {
    if (value !== null && value !== undefined && value !== '') {
      warnings.push(`Некорректный BPM у трека «${name}» заменён на пустое значение.`)
    }
    return null
  }
  const rounded = Math.round(parsed)
  if (rounded !== parsed) warnings.push(`BPM у трека «${name}» округлён до целого числа.`)
  const clamped = Math.min(LIMITS.bpmMax, Math.max(LIMITS.bpmMin, rounded))
  if (clamped !== rounded) {
    warnings.push(`BPM у трека «${name}» ограничен диапазоном ${LIMITS.bpmMin}–${LIMITS.bpmMax}.`)
  }
  return clamped
}

function normalizeImportedKey(
  value: unknown,
  name: string,
  warnings: string[],
): MusicalKey | null {
  if (value === null || value === undefined || value === '') return null
  const matched = matchMusicalKey(value)
  if (matched) return matched
  warnings.push(`Недопустимая тональность у трека «${name}» заменена на пустое значение.`)
  return null
}

function normalizeImportedGenre(value: unknown, name: string, warnings: string[]): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.length > LIMITS.genreMax) {
    warnings.push(`Жанр трека «${name}» обрезан до ${LIMITS.genreMax} символов.`)
    return trimmed.slice(0, LIMITS.genreMax)
  }
  return trimmed
}

function normalizeImportedNotes(value: unknown, name: string, warnings: string[]): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (trimmed.length > LIMITS.notesMax) {
    warnings.push(`Заметки трека «${name}» обрезаны до ${LIMITS.notesMax} символов.`)
    return trimmed.slice(0, LIMITS.notesMax)
  }
  return trimmed
}

function normalizeImportedColor(value: unknown, name: string, warnings: string[]): TrackColor {
  if (typeof value === 'string' && (TRACK_COLORS as readonly string[]).includes(value)) {
    return value as TrackColor
  }
  if (value !== null && value !== undefined) {
    warnings.push(`Цвет трека «${name}» заменён на стандартный.`)
  }
  return DEFAULT_TRACK_COLOR
}

function normalizeTimestamp(
  value: unknown,
  fallback: string,
  label: string,
  trackName: string,
  warnings: string[],
): string {
  if (typeof value === 'string') {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return date.toISOString()
  }
  warnings.push(`Некорректная дата ${label} у трека «${trackName}» заменена текущей.`)
  return fallback
}

/** Мягкая нормализация записи из manifest: не бросает ошибок, собирает предупреждения. */
export function normalizeImportedTrackMetadata(record: unknown): ImportedTrackNormalization {
  if (!isRecord(record)) {
    throw new AppError('IMPORT_INVALID_MANIFEST', 'Запись трека имеет неверный формат.')
  }
  const warnings: string[] = []
  const rawName = typeof record.name === 'string' ? record.name.trim() : ''
  let name = rawName.slice(0, LIMITS.nameMax)
  if (!name) {
    name = 'Без названия'
    warnings.push('Трек без названия переименован в «Без названия».')
  } else if (rawName.length > LIMITS.nameMax) {
    warnings.push(`Название трека обрезано до ${LIMITS.nameMax} символов.`)
  }

  const tags = sanitizeTags(record.tags)
  if (Array.isArray(record.tags) && record.tags.length > LIMITS.tagsMax) {
    warnings.push(`У трека «${name}» оставлены только первые ${LIMITS.tagsMax} тегов.`)
  }

  const now = new Date().toISOString()
  const createdAt = normalizeTimestamp(record.createdAt, now, 'создания', name, warnings)
  const updatedAt = normalizeTimestamp(record.updatedAt, createdAt, 'изменения', name, warnings)

  let lastPlayedAt: string | null = null
  if (typeof record.lastPlayedAt === 'string' && record.lastPlayedAt.trim()) {
    const parsed = new Date(record.lastPlayedAt)
    if (Number.isNaN(parsed.getTime())) {
      warnings.push(`Некорректная дата прослушивания у трека «${name}» удалена.`)
    } else {
      lastPlayedAt = parsed.toISOString()
    }
  }

  let playCount = 0
  const rawPlayCount = lenientNumber(record.playCount)
  if (rawPlayCount !== null) {
    if (rawPlayCount < 0) {
      warnings.push(`Отрицательное число прослушиваний у трека «${name}» заменено нулём.`)
    } else {
      playCount = Math.floor(rawPlayCount)
    }
  }

  const rawDuration = lenientNumber(record.durationSec)
  const durationSec = rawDuration !== null && rawDuration >= 0 ? rawDuration : null
  const id = typeof record.id === 'string' && record.id.trim() ? record.id.trim() : null

  return {
    track: {
      id,
      name,
      bpm: normalizeImportedBpm(record.bpm, name, warnings),
      musicalKey: normalizeImportedKey(record.musicalKey, name, warnings),
      genre: normalizeImportedGenre(record.genre, name, warnings),
      tags,
      notes: normalizeImportedNotes(record.notes, name, warnings),
      color: normalizeImportedColor(record.color, name, warnings),
      audioFileId: lenientFileId(record.audioFileId),
      coverFileId: lenientFileId(record.coverFileId),
      attachmentFileIds: lenientStringList(record.attachmentFileIds),
      isFavorite: record.isFavorite === true,
      durationSec,
      createdAt,
      updatedAt,
      lastPlayedAt,
      playCount,
    },
    warnings,
  }
}
