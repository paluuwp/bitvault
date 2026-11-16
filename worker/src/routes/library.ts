import { Hono } from 'hono'
import type { Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { AppEnv, Env } from '../env'
import type {
  FileRecord,
  LibraryWithRole,
  Store,
  TrackWithFiles,
} from '../db/store'
import { DEFAULT_TRACK_COLOR } from '../db/store'
import { requireAuth } from '../middleware/auth'
import { ApiError, errorEnvelope } from '../lib/errors'
import { MEDIA_URL_TTL_SEC, signMediaToken, verifyMediaToken } from '../lib/media'

const MAX_TRACK_BODY_BYTES = 64 * 1024
const MAX_NAME_LENGTH = 100
const MAX_BPM = 400
const MIN_BPM = 20
const MAX_GENRE_LENGTH = 40
const MAX_TAGS = 10
const MAX_TAG_LENGTH = 24
const MAX_NOTES_LENGTH = 2000
const MAX_ATTACHMENTS = 50
const MAX_FILE_NAME_LENGTH = 255
const MAX_MIME_LENGTH = 255
const AUDIO_MAX_BYTES = 90 * 1024 * 1024
const COVER_MAX_BYTES = 10 * 1024 * 1024
const ATTACHMENT_MAX_BYTES = 90 * 1024 * 1024
const DEFAULT_FILE_MIME = 'application/octet-stream'

/** Шаблон клиентских id треков и файлов из контракта. */
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const MIME_PATTERN = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/
const ISO_8601_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:?\d{2})$/i
const RANGE_PATTERN = /^bytes=(\d*)-(\d*)$/i
const EXP_PATTERN = /^\d{1,12}$/

const TRACK_COLORS: readonly string[] = [
  '#D8FF3E',
  '#8B5CF6',
  '#38BDF8',
  '#FB7185',
  '#F59E0B',
  '#34D399',
]

const MUSICAL_KEYS: readonly string[] = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
  'Cm',
  'C#m',
  'Dm',
  'D#m',
  'Em',
  'Fm',
  'F#m',
  'Gm',
  'G#m',
  'Am',
  'A#m',
  'Bm',
]

const WRITE_ROLES: readonly string[] = ['owner', 'editor']

export interface FileDto {
  id: string
  kind: string
  name: string
  mimeType: string
  size: number
}

export interface TrackDto {
  id: string
  name: string
  bpm: number | null
  musicalKey: string | null
  genre: string | null
  tags: string[]
  notes: string
  color: string
  isFavorite: boolean
  durationSec: number | null
  createdAt: string
  updatedAt: string
  lastPlayedAt: string | null
  playCount: number
  audioFile: FileDto | null
  coverFile: FileDto | null
  attachments: FileDto[]
}

export interface LibrarySummary {
  id: string
  name: string
  role: string
}

export interface SignedFileUrl {
  url: string
  expiresAt: string
  file: FileDto
}

export interface LibraryRoutesDeps {
  storeFactory: (env: Env) => Store
  now: () => Date
}

interface NormalizedTrack {
  name: string
  bpm: number | null
  musicalKey: string | null
  genre: string | null
  tags: string[]
  notes: string
  color: string
  isFavorite: boolean
  durationSec: number | null
  createdAt: string
  updatedAt: string
  audioFileId: string | null
  coverFileId: string | null
  attachmentFileIds: string[]
}

interface ByteRange {
  start: number
  end: number
  offset: number
  length: number
}

function badRequest(message: string): never {
  throw new ApiError('BAD_REQUEST', message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toFileDto(file: FileRecord): FileDto {
  return {
    id: file.id,
    kind: file.kind,
    name: file.originalName ?? file.id,
    mimeType: file.mimeType ?? DEFAULT_FILE_MIME,
    size: file.size ?? 0,
  }
}

function toTrackDto(track: TrackWithFiles): TrackDto {
  return {
    id: track.id,
    name: track.name,
    bpm: track.bpm,
    musicalKey: track.musicalKey,
    genre: track.genre,
    tags: [...track.tags],
    notes: track.notes,
    color: track.color,
    isFavorite: track.isFavorite,
    durationSec: track.durationSec,
    createdAt: track.createdAt,
    updatedAt: track.updatedAt,
    lastPlayedAt: track.lastPlayedAt,
    playCount: track.playCount,
    audioFile: track.audioFile ? toFileDto(track.audioFile) : null,
    coverFile: track.coverFile ? toFileDto(track.coverFile) : null,
    attachments: track.attachments.map(toFileDto),
  }
}

function toLibrarySummary(library: LibraryWithRole): LibrarySummary {
  return { id: library.id, name: library.name, role: library.role }
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

function normalizeName(value: unknown): string {
  if (typeof value !== 'string') badRequest('Введите название трека.')
  const name = value.trim()
  if (name.length < 1) badRequest('Введите название трека.')
  if (name.length > MAX_NAME_LENGTH) {
    badRequest(`Название не должно превышать ${MAX_NAME_LENGTH} символов.`)
  }
  return name
}

function normalizeBpm(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = parseNumber(value)
  if (parsed === null) badRequest(`BPM должен быть числом от ${MIN_BPM} до ${MAX_BPM}.`)
  if (!Number.isInteger(parsed)) badRequest('BPM должен быть целым числом.')
  if (parsed < MIN_BPM || parsed > MAX_BPM) {
    badRequest(`BPM должен быть от ${MIN_BPM} до ${MAX_BPM}.`)
  }
  return parsed
}

function normalizeMusicalKey(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string' || !MUSICAL_KEYS.includes(value.trim())) {
    badRequest('Выберите тональность из списка.')
  }
  return value.trim()
}

function normalizeGenre(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') badRequest('Жанр должен быть строкой.')
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.length > MAX_GENRE_LENGTH) {
    badRequest(`Жанр не должен превышать ${MAX_GENRE_LENGTH} символов.`)
  }
  return trimmed
}

function normalizeNotes(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value !== 'string') badRequest('Заметки должны быть строкой.')
  const trimmed = value.trim()
  if (trimmed.length > MAX_NOTES_LENGTH) {
    badRequest(`Заметки не должны превышать ${MAX_NOTES_LENGTH} символов.`)
  }
  return trimmed
}

function normalizeColor(value: unknown): string {
  if (value === null || value === undefined || value === '') return DEFAULT_TRACK_COLOR
  if (typeof value !== 'string' || !TRACK_COLORS.includes(value)) {
    badRequest('Выберите цвет из палитры.')
  }
  return value
}

function normalizeDuration(value: unknown): number | null {
  const parsed = parseNumber(value)
  if (parsed === null || parsed < 0) return null
  return parsed
}

function normalizeTags(value: unknown): string[] {
  if (value === null || value === undefined) return []

  let values: unknown[]
  if (typeof value === 'string') {
    values = value.split(',')
  } else if (Array.isArray(value)) {
    values = value
  } else {
    badRequest('Теги должны быть массивом строк.')
  }

  const result: string[] = []
  const seen = new Set<string>()
  for (const item of values) {
    if (typeof item !== 'string') badRequest('Теги должны быть массивом строк.')
    let tag = item.trim()
    while (tag.startsWith('#')) tag = tag.slice(1).trim()
    if (!tag) continue
    if (tag.length > MAX_TAG_LENGTH) {
      badRequest(`Тег не должен превышать ${MAX_TAG_LENGTH} символов.`)
    }
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(tag)
  }

  if (result.length > MAX_TAGS) {
    badRequest(`У трека может быть не больше ${MAX_TAGS} тегов.`)
  }
  return result
}

function normalizeFileId(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') badRequest(`Некорректная ссылка на файл (${field}).`)
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!ID_PATTERN.test(trimmed)) badRequest(`Некорректный идентификатор файла (${field}).`)
  return trimmed
}

function normalizeFileIds(value: unknown): string[] {
  if (value === null || value === undefined) return []
  if (!Array.isArray(value)) badRequest('Некорректный список вложений.')

  const result: string[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') badRequest('Некорректный список вложений.')
    const trimmed = item.trim()
    if (!trimmed) continue
    if (!ID_PATTERN.test(trimmed)) badRequest('Некорректный идентификатор вложения.')
    if (seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
  }

  if (result.length > MAX_ATTACHMENTS) {
    badRequest(`К треку можно приложить не больше ${MAX_ATTACHMENTS} файлов.`)
  }
  return result
}

function normalizeTimestamp(value: unknown, fallback: string): string {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (ISO_8601_PATTERN.test(trimmed)) {
      const parsed = Date.parse(trimmed)
      if (Number.isFinite(parsed)) return new Date(parsed).toISOString()
    }
  }
  return fallback
}

function normalizeTrackBody(body: Record<string, unknown>, nowIso: string): NormalizedTrack {
  return {
    name: normalizeName(body.name),
    bpm: normalizeBpm(body.bpm),
    musicalKey: normalizeMusicalKey(body.musicalKey),
    genre: normalizeGenre(body.genre),
    tags: normalizeTags(body.tags),
    notes: normalizeNotes(body.notes),
    color: normalizeColor(body.color),
    isFavorite: body.isFavorite === true,
    durationSec: normalizeDuration(body.durationSec),
    createdAt: normalizeTimestamp(body.createdAt, nowIso),
    updatedAt: normalizeTimestamp(body.updatedAt, nowIso),
    audioFileId: normalizeFileId(body.audioFileId, 'audioFileId'),
    coverFileId: normalizeFileId(body.coverFileId, 'coverFileId'),
    attachmentFileIds: normalizeFileIds(body.attachmentFileIds),
  }
}

async function readJsonBody(c: Context<AppEnv>): Promise<Record<string, unknown>> {
  const mediaType = (c.req.header('Content-Type') ?? '').split(';')[0]?.trim().toLowerCase()
  if (mediaType !== 'application/json') {
    throw new ApiError('BAD_REQUEST', 'Ожидается Content-Type: application/json.')
  }
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    throw new ApiError('BAD_REQUEST', 'Тело запроса должно быть корректным JSON.')
  }
  if (!isRecord(body)) {
    throw new ApiError('BAD_REQUEST', 'Тело запроса должно быть JSON-объектом.')
  }
  return body
}

/**
 * Проверяет членство и, для записи, роль owner/editor.
 * Нет библиотеки или членства → 404 (не раскрываем существование чужой
 * библиотеки); роль только на чтение → 403.
 */
async function requireLibrary(
  store: Store,
  libraryId: string,
  userId: string,
  write: boolean,
): Promise<LibraryWithRole> {
  const library = await store.findLibraryForUser(libraryId, userId)
  if (!library) throw new ApiError('NOT_FOUND', 'Библиотека не найдена.')
  if (write && !WRITE_ROLES.includes(library.role)) {
    throw new ApiError('FORBIDDEN', 'Недостаточно прав для изменения библиотеки.')
  }
  return library
}

/** Все переданные id должны принадлежать библиотеке и не быть удалёнными. */
async function loadLibraryFiles(
  store: Store,
  libraryId: string,
  ids: readonly string[],
): Promise<Map<string, FileRecord>> {
  const unique = [...new Set(ids)]
  const found = await Promise.all(unique.map((id) => store.findFileById(id)))
  const result = new Map<string, FileRecord>()

  for (let index = 0; index < unique.length; index += 1) {
    const id = unique[index]
    const file = found[index]
    if (!id || !file || file.libraryId !== libraryId || file.deletedAt !== null) {
      badRequest('Файл не найден в этой библиотеке.')
    }
    result.set(id, file)
  }
  return result
}

function requiredFile(files: Map<string, FileRecord>, id: string | null): FileRecord | null {
  if (id === null) return null
  const file = files.get(id)
  if (!file) throw new ApiError('INTERNAL', 'Файл трека не найден после сохранения.')
  return file
}

function requireTrackId(raw: string): string {
  if (!ID_PATTERN.test(raw)) badRequest('Некорректный идентификатор трека.')
  return raw
}

/** Невалидный id библиотеки — тот же 404, что и несуществующая. */
function requireLibraryId(raw: string): string {
  if (!ID_PATTERN.test(raw)) throw new ApiError('NOT_FOUND', 'Библиотека не найдена.')
  return raw
}

function requireFileId(raw: string): string {
  if (!ID_PATTERN.test(raw)) badRequest('Некорректный идентификатор файла.')
  return raw
}

function normalizeOriginalName(raw: string | undefined): string | null {
  if (raw === undefined) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (trimmed.length > MAX_FILE_NAME_LENGTH) {
    badRequest(`Имя файла не должно превышать ${MAX_FILE_NAME_LENGTH} символов.`)
  }
  return trimmed
}

function readMimeType(c: Context<AppEnv>): string {
  const raw = c.req.header('Content-Type')
  if (!raw) badRequest('Не передан Content-Type файла.')
  const mediaType = raw.split(';')[0]?.trim().toLowerCase() ?? ''
  if (!mediaType || mediaType.length > MAX_MIME_LENGTH || !MIME_PATTERN.test(mediaType)) {
    badRequest('Некорректный Content-Type файла.')
  }
  return mediaType
}

/** Content-Length проверяется до чтения тела; фактический размер — после. */
function readDeclaredLength(c: Context<AppEnv>): number | null {
  const raw = c.req.header('Content-Length')
  if (raw === undefined) return null
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) badRequest('Некорректный Content-Length.')
  const value = Number(trimmed)
  if (!Number.isSafeInteger(value)) badRequest('Некорректный Content-Length.')
  return value
}

async function deleteQuietly(env: Env, key: string): Promise<void> {
  try {
    await env.BUCKET.delete(key)
  } catch {
    // Best-effort: сбой уборки не должен подменять исходную ошибку.
  }
}

/**
 * Одиночный Range: `bytes=start-end`, `bytes=start-`, `bytes=-suffix`.
 * null — диапазон не разобран (отдаём файл целиком), 'unsatisfiable' — 416.
 */
function parseRange(
  header: string,
  totalSize: number | null,
): ByteRange | null | 'unsatisfiable' {
  const match = RANGE_PATTERN.exec(header.trim())
  if (!match) return null
  const startRaw = match[1] ?? ''
  const endRaw = match[2] ?? ''
  if (startRaw === '' && endRaw === '') return null

  if (startRaw === '') {
    if (totalSize === null) return null
    const suffix = Number(endRaw)
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null
    if (totalSize === 0) return 'unsatisfiable'
    const start = Math.max(totalSize - suffix, 0)
    return { start, end: totalSize - 1, offset: start, length: totalSize - start }
  }

  const start = Number(startRaw)
  if (!Number.isSafeInteger(start) || start < 0) return null
  if (totalSize !== null && start >= totalSize) return 'unsatisfiable'

  let end: number
  if (endRaw === '') {
    if (totalSize === null) return null
    end = totalSize - 1
  } else {
    end = Number(endRaw)
    if (!Number.isSafeInteger(end)) return null
    if (totalSize !== null) end = Math.min(end, totalSize - 1)
  }
  if (end < start) return 'unsatisfiable'
  return { start, end, offset: start, length: end - start + 1 }
}

export function libraryRoutes(deps: LibraryRoutesDeps): Hono<AppEnv> {
  const router = new Hono<AppEnv>()
  const auth = requireAuth({ storeFactory: deps.storeFactory, now: deps.now })

  router.get('/:libraryId/tracks', auth, async (c) => {
    const store = deps.storeFactory(c.env)
    const libraryId = requireLibraryId(c.req.param('libraryId'))
    const library = await requireLibrary(store, libraryId, c.get('userId'), false)
    const tracks = await store.listTracksForLibrary(libraryId)
    return c.json({
      library: toLibrarySummary(library),
      tracks: tracks.map(toTrackDto),
    })
  })

  router.put(
    '/:libraryId/tracks/:trackId',
    auth,
    bodyLimit({
      maxSize: MAX_TRACK_BODY_BYTES,
      onError: (c) => c.json(errorEnvelope('PAYLOAD_TOO_LARGE'), 413),
    }),
    async (c) => {
      const store = deps.storeFactory(c.env)
      const libraryId = requireLibraryId(c.req.param('libraryId'))
      await requireLibrary(store, libraryId, c.get('userId'), true)
      const trackId = requireTrackId(c.req.param('trackId'))

      const body = await readJsonBody(c)
      const input = normalizeTrackBody(body, deps.now().toISOString())

      const files = await loadLibraryFiles(store, libraryId, [
        ...(input.audioFileId ? [input.audioFileId] : []),
        ...(input.coverFileId ? [input.coverFileId] : []),
        ...input.attachmentFileIds,
      ])

      const saved = await store.upsertTrack({ ...input, id: trackId, libraryId })
      if (!saved) {
        throw new ApiError('CONFLICT', 'Трек с таким ID уже существует в другой библиотеке.')
      }

      const attachments = input.attachmentFileIds
        .map((id) => requiredFile(files, id))
        .filter((file): file is FileRecord => file !== null)

      return c.json(
        toTrackDto({
          ...saved,
          audioFile: requiredFile(files, input.audioFileId),
          coverFile: requiredFile(files, input.coverFileId),
          attachments,
        }),
        200,
      )
    },
  )

  router.delete('/:libraryId/tracks/:trackId', auth, async (c) => {
    const store = deps.storeFactory(c.env)
    const libraryId = requireLibraryId(c.req.param('libraryId'))
    await requireLibrary(store, libraryId, c.get('userId'), true)
    const trackId = requireTrackId(c.req.param('trackId'))
    await store.softDeleteTrack(libraryId, trackId, deps.now().toISOString())
    return c.body(null, 204)
  })

  router.put('/:libraryId/files/:fileId', auth, async (c) => {
    const store = deps.storeFactory(c.env)
    const libraryId = requireLibraryId(c.req.param('libraryId'))
    await requireLibrary(store, libraryId, c.get('userId'), true)
    const fileId = requireFileId(c.req.param('fileId'))

    const kind = c.req.query('kind')
    if (kind !== 'audio' && kind !== 'cover' && kind !== 'attachment') {
      badRequest('Параметр kind должен быть audio, cover или attachment.')
    }
    const originalName = normalizeOriginalName(c.req.query('name'))
    const mimeType = readMimeType(c)
    const maxBytes =
      kind === 'cover'
        ? COVER_MAX_BYTES
        : kind === 'audio'
          ? AUDIO_MAX_BYTES
          : ATTACHMENT_MAX_BYTES

    const declared = readDeclaredLength(c)
    if (declared !== null && declared > maxBytes) {
      throw new ApiError('PAYLOAD_TOO_LARGE', 'Файл больше допустимого размера.')
    }

    const existing = await store.findFileById(fileId)
    if (existing && existing.libraryId !== libraryId) {
      throw new ApiError('CONFLICT', 'Файл с таким ID уже существует в другой библиотеке.')
    }

    const bytes = new Uint8Array(await c.req.arrayBuffer())
    if (bytes.byteLength === 0) badRequest('Пустое тело файла.')
    if (bytes.byteLength > maxBytes) {
      throw new ApiError('PAYLOAD_TOO_LARGE', 'Файл больше допустимого размера.')
    }

    // Ключ R2 не содержит имени файла: имя живёт только в D1.
    const r2Key = `libraries/${libraryId}/files/${fileId}`
    await c.env.BUCKET.put(r2Key, bytes, { httpMetadata: { contentType: mimeType } })

    let saved: FileRecord | null
    try {
      saved = await store.upsertFile({
        id: fileId,
        libraryId,
        kind,
        r2Key,
        mimeType,
        size: bytes.byteLength,
        originalName,
        now: deps.now().toISOString(),
      })
    } catch (error) {
      // При перезаписи объекта уже лежащая строка D1 указывает на этот же
      // ключ: удалять байты нельзя, иначе действующий файл станет 404.
      if (!existing) await deleteQuietly(c.env, r2Key)
      throw error
    }
    if (!saved) {
      if (!existing) await deleteQuietly(c.env, r2Key)
      throw new ApiError('CONFLICT', 'Файл с таким ID уже существует в другой библиотеке.')
    }

    return c.json(toFileDto(saved), 200)
  })

  router.get('/:libraryId/files/:fileId/url', auth, async (c) => {
    const store = deps.storeFactory(c.env)
    const libraryId = requireLibraryId(c.req.param('libraryId'))
    await requireLibrary(store, libraryId, c.get('userId'), false)
    const fileId = requireFileId(c.req.param('fileId'))

    const file = await store.findFileById(fileId)
    if (!file || file.libraryId !== libraryId || file.deletedAt !== null) {
      throw new ApiError('NOT_FOUND', 'Файл не найден.')
    }

    const secret = c.env.MEDIA_TOKEN_SECRET?.trim()
    if (!secret) throw new ApiError('UNAVAILABLE', 'Медиа-токены не настроены.')

    const expiresAtSec = Math.floor(deps.now().getTime() / 1000) + MEDIA_URL_TTL_SEC
    const sig = await signMediaToken(secret, file.id, expiresAtSec)
    const origin = new URL(c.req.url).origin
    const url = `${origin}/api/v1/media/${encodeURIComponent(file.id)}?exp=${expiresAtSec}&sig=${sig}`

    return c.json({
      url,
      expiresAt: new Date(expiresAtSec * 1000).toISOString(),
      file: toFileDto(file),
    })
  })

  return router
}

/**
 * Медиа-стриминг без Bearer: доступ подтверждается HMAC-подписью в query.
 * Поддерживается одиночный Range (206), иначе файл отдаётся целиком (200).
 */
export function mediaRoutes(deps: LibraryRoutesDeps): Hono<AppEnv> {
  const router = new Hono<AppEnv>()

  router.get('/:fileId', async (c) => {
    const fileId = c.req.param('fileId')
    if (!ID_PATTERN.test(fileId)) throw new ApiError('NOT_FOUND', 'Файл не найден.')

    const secret = c.env.MEDIA_TOKEN_SECRET?.trim()
    if (!secret) throw new ApiError('UNAVAILABLE', 'Медиа-токены не настроены.')

    const expRaw = c.req.query('exp') ?? ''
    const sig = c.req.query('sig') ?? ''
    if (!EXP_PATTERN.test(expRaw)) {
      throw new ApiError('UNAUTHORIZED', 'Ссылка на файл недействительна.')
    }
    const expiresAtSec = Number(expRaw)
    if (!(await verifyMediaToken(secret, fileId, expiresAtSec, sig))) {
      throw new ApiError('UNAUTHORIZED', 'Ссылка на файл недействительна.')
    }
    if (expiresAtSec <= Math.floor(deps.now().getTime() / 1000)) {
      throw new ApiError('UNAUTHORIZED', 'Срок действия ссылки истёк.')
    }

    const store = deps.storeFactory(c.env)
    const file = await store.findFileById(fileId)
    if (!file || file.deletedAt !== null) throw new ApiError('NOT_FOUND', 'Файл не найден.')

    const totalSize =
      file.size !== null && Number.isSafeInteger(file.size) && file.size >= 0 ? file.size : null
    const rangeHeader = c.req.header('Range')
    const range = rangeHeader ? parseRange(rangeHeader.trim(), totalSize) : null

    if (range === 'unsatisfiable') {
      const headers = new Headers()
      if (totalSize !== null) headers.set('Content-Range', `bytes */${totalSize}`)
      return new Response(null, { status: 416, headers })
    }

    const object = range
      ? await c.env.BUCKET.get(file.r2Key, {
          range: { offset: range.offset, length: range.length },
        })
      : await c.env.BUCKET.get(file.r2Key)
    if (!object) throw new ApiError('NOT_FOUND', 'Файл не найден.')

    const headers = new Headers()
    headers.set(
      'Content-Type',
      file.mimeType ?? object.httpMetadata?.contentType ?? DEFAULT_FILE_MIME,
    )
    headers.set('Accept-Ranges', 'bytes')
    headers.set('Cache-Control', 'private, max-age=3600')
    headers.set('ETag', object.httpEtag)
    // Защита в глубину: вложения не должны исполняться на origin Worker'а,
    // даже если в библиотеку попал HTML/SVG с подходящим MIME.
    headers.set('X-Content-Type-Options', 'nosniff')
    headers.set('Content-Security-Policy', "default-src 'none'; sandbox")
    if (file.kind !== 'audio' && file.kind !== 'cover') {
      headers.set('Content-Disposition', 'attachment')
    }

    if (range) {
      const total = totalSize ?? range.end + 1
      headers.set('Content-Range', `bytes ${range.start}-${range.end}/${total}`)
      headers.set('Content-Length', String(range.length))
      return new Response(object.body, { status: 206, headers })
    }

    headers.set('Content-Length', String(object.size))
    return new Response(object.body, { status: 200, headers })
  })

  return router
}
