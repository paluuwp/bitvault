/**
 * Библиотека аккаунта: связь между локальным кэшем (IndexedDB) и Worker API.
 *
 * Модуль не зависит от React. Пока пользователь не вошёл, все функции
 * недоступны (`getCloudContext()` возвращает null) и приложение работает
 * полностью локально. После входа источником истины для треков становится
 * сервер: метаданные кэшируются в IndexedDB, файлы скачиваются по требованию
 * и тоже кэшируются.
 */
import type { RemoteApi, RemoteFile, RemoteTrack } from './api'
import { createRemoteApi, describeRemoteApiError, isRemoteApiError } from './api'
import type { AuthSession } from './auth/session'
import { createSessionStore } from './auth/session'
import { resolvePublicConfig } from './config'
import { DEFAULT_TRACK_COLOR, LIMITS, MUSICAL_KEYS, TRACK_COLORS } from './constants'
import { withDatabase, runWriteTransaction } from './db'
import { AppError, isAppError } from './errors'
import type { MusicalKey, StoredFile, Track, TrackColor } from '../types/models'

export interface CloudContext {
  token: string
  libraryId: string
  api: RemoteApi
  /** Поколение сессии: после выхода старые ответы не должны попасть в кэш. */
  epoch: number
}

/**
 * Поколение аккаунта. Увеличивается при выходе (очистке кэша), чтобы
 * запоздавшие ответы сети не воскресили треки прошлого пользователя.
 */
let cloudEpoch = 0
/** Счётчик локальных изменений: refresh не удаляет треки, изменённые после старта. */
let cloudMutationSeq = 0

/** Клиент создаётся на каждый вызов: fetch может подменяться в тестах. */
function apiFor(baseUrl: string): RemoteApi {
  return createRemoteApi({ baseUrl })
}

/** Контекст аккаунта или null, если пользователь не вошёл. */
export function getCloudContext(): CloudContext | null {
  const config = resolvePublicConfig()
  if (!config.authEnabled || !config.apiBaseUrl) return null

  let session: AuthSession | null
  try {
    session = createSessionStore().read()
  } catch {
    return null
  }
  if (!session) return null

  const library =
    session.libraries.find((item) => item.role === 'owner') ?? session.libraries[0]
  if (!library) return null

  return {
    token: session.token,
    libraryId: library.id,
    api: apiFor(config.apiBaseUrl),
    epoch: cloudEpoch,
  }
}

export function isCloudActive(): boolean {
  return getCloudContext() !== null
}

function cloudError(error: unknown): AppError {
  if (isAppError(error)) return error
  if (isRemoteApiError(error)) {
    return new AppError('CLOUD_UNAVAILABLE', describeRemoteApiError(error, 'library'), {
      cause: error,
    })
  }
  return new AppError('CLOUD_UNAVAILABLE', undefined, { cause: error })
}

function toMusicalKey(value: string | null): MusicalKey | null {
  if (value === null) return null
  return (MUSICAL_KEYS as readonly string[]).includes(value) ? (value as MusicalKey) : null
}

function toTrackColor(value: string): TrackColor {
  return (TRACK_COLORS as readonly string[]).includes(value)
    ? (value as TrackColor)
    : DEFAULT_TRACK_COLOR
}

function sanitizeTags(tags: string[]): string[] {
  const result: string[] = []
  for (const tag of tags) {
    const trimmed = tag.trim()
    if (trimmed && !result.includes(trimmed)) result.push(trimmed)
    if (result.length >= LIMITS.tagsMax) break
  }
  return result
}

/** Преобразует серверный трек в доменную модель с пометкой «из аккаунта». */
export function remoteTrackToTrack(remote: RemoteTrack): Track {
  const name = remote.name.trim() || 'Без названия'
  return {
    id: remote.id,
    name,
    nameLower: name.toLocaleLowerCase('ru'),
    bpm: remote.bpm,
    musicalKey: toMusicalKey(remote.musicalKey),
    genre: remote.genre,
    tags: sanitizeTags(remote.tags),
    notes: remote.notes,
    color: toTrackColor(remote.color),
    audioFileId: remote.audioFile?.id ?? null,
    coverFileId: remote.coverFile?.id ?? null,
    attachmentFileIds: remote.attachments.map((file) => file.id),
    isFavorite: remote.isFavorite,
    durationSec: remote.durationSec,
    createdAt: remote.createdAt,
    updatedAt: remote.updatedAt,
    lastPlayedAt: remote.lastPlayedAt,
    playCount: remote.playCount,
    source: 'cloud',
  }
}

/** Поля доменного трека, которые хранит сервер. */
function toRemoteInput(track: Track) {
  return {
    name: track.name,
    bpm: track.bpm,
    musicalKey: track.musicalKey,
    genre: track.genre,
    tags: track.tags,
    notes: track.notes,
    color: track.color,
    isFavorite: track.isFavorite,
    durationSec: track.durationSec,
    createdAt: track.createdAt,
    updatedAt: track.updatedAt,
    audioFileId: track.audioFileId,
    coverFileId: track.coverFileId,
    attachmentFileIds: track.attachmentFileIds,
  }
}

function fileIdsOf(track: Track): string[] {
  const ids = new Set<string>()
  if (track.audioFileId) ids.add(track.audioFileId)
  if (track.coverFileId) ids.add(track.coverFileId)
  for (const fileId of track.attachmentFileIds) ids.add(fileId)
  return [...ids]
}

async function readLocalFile(fileId: string): Promise<StoredFile | null> {
  return withDatabase(async (database) => (await database.get('files', fileId)) ?? null)
}

async function writeLocalFile(file: StoredFile): Promise<void> {
  await withDatabase(async (database) => {
    await database.put('files', file)
  })
}

async function writeLocalTrack(track: Track): Promise<void> {
  await withDatabase(async (database) => {
    await database.put('tracks', track)
  })
}

/**
 * Сервер не принимает файлы больше лимита тела запроса Worker. Проверяем до
 * отправки и для уже сохранённых файлов (например, при переносе в аккаунт),
 * иначе браузер упрётся в лимит платформы и покажет непонятную ошибку.
 */
function assertCloudFileSize(file: StoredFile): void {
  if (file.size <= LIMITS.cloudFileMaxBytes) return
  const limitMb = Math.floor(LIMITS.cloudFileMaxBytes / (1024 * 1024))
  throw new AppError(
    'VALIDATION',
    `«${file.originalName}» больше ${limitMb} МБ — сервер аккаунта не принимает такие файлы. Трек останется только на этом устройстве.`,
  )
}

async function uploadMissingFiles(
  context: CloudContext,
  track: Track,
  onProgress?: (label: string) => void,
): Promise<void> {
  for (const fileId of fileIdsOf(track)) {
    const file = await readLocalFile(fileId)
    // Файла нет в кэше — значит, он уже лежит на сервере (трек пришёл с
    // другого устройства) либо был удалён. Ничего не загружаем.
    if (!file) continue
    if (file.cloudLibraryId === context.libraryId && file.cloudUploadedAt) continue

    assertCloudFileSize(file)
    onProgress?.(`Загрузка «${file.originalName}»…`)
    try {
      await context.api.uploadFile(context.token, context.libraryId, file.id, file.blob, {
        kind: file.kind,
        name: file.originalName,
        mimeType: file.mimeType,
      })
    } catch (error) {
      throw cloudError(error)
    }
    assertSameEpoch(context)
    await writeLocalFile({
      ...file,
      cloudUploadedAt: new Date().toISOString(),
      cloudLibraryId: context.libraryId,
    })
  }
}

/**
 * Загружает трек и его файлы в библиотеку аккаунта (идемпотентный upsert)
 * и сохраняет серверную версию в локальный кэш.
 */
export async function pushTrackToCloud(
  context: CloudContext,
  track: Track,
  onProgress?: (label: string) => void,
): Promise<Track> {
  cloudMutationSeq += 1
  await uploadMissingFiles(context, track, onProgress)

  let stored: RemoteTrack
  try {
    stored = await context.api.putTrack(
      context.token,
      context.libraryId,
      track.id,
      toRemoteInput(track),
    )
  } catch (error) {
    throw cloudError(error)
  }

  assertSameEpoch(context)
  const mapped = keepPlayStats(remoteTrackToTrack(stored), track)
  cloudTombstones.delete(track.id)
  await writeLocalTrack(mapped)
  return mapped
}

export async function deleteTrackFromCloud(
  context: CloudContext,
  trackId: string,
): Promise<void> {
  cloudMutationSeq += 1
  try {
    await context.api.deleteTrack(context.token, context.libraryId, trackId)
  } catch (error) {
    throw cloudError(error)
  }
  rememberTombstone(trackId)
}

/** После выхода пользователя запоздавшие ответы нельзя записывать в кэш. */
function assertSameEpoch(context: CloudContext): void {
  if (context.epoch !== cloudEpoch) {
    throw new AppError('CLOUD_UNAVAILABLE', 'Сессия аккаунта завершилась. Войдите снова.')
  }
}

/** id облачных треков, удалённых на сервере: запоздавший refresh не вернёт их. */
const cloudTombstones = new Set<string>()

function rememberTombstone(trackId: string): void {
  cloudTombstones.add(trackId)
  if (cloudTombstones.size > 1000) {
    const oldest = cloudTombstones.values().next().value
    if (oldest !== undefined) cloudTombstones.delete(oldest)
  }
}

function laterDate(left: string | null, right: string | null): string | null {
  if (left === null) return right
  if (right === null) return left
  return left > right ? left : right
}

/**
 * Сервер пока не хранит статистику прослушиваний: при записи трека
 * сохраняем локальные счётчик и дату последнего прослушивания.
 */
function keepPlayStats(next: Track, previous: Track): Track {
  return {
    ...next,
    playCount: Math.max(previous.playCount, next.playCount),
    lastPlayedAt: laterDate(previous.lastPlayedAt, next.lastPlayedAt),
  }
}

/**
 * Совмещает серверную версию с локальным кэшем: более свежая правка выигрывает,
 * а счётчик прослушиваний не уменьшается (сервер пока не хранит его).
 */
function mergeCloudTrack(local: Track, remote: Track): Track {
  if (local.source !== 'cloud') return remote

  const base = local.updatedAt > remote.updatedAt ? local : remote
  return {
    ...base,
    source: 'cloud',
    playCount: Math.max(local.playCount, remote.playCount),
    lastPlayedAt: laterDate(local.lastPlayedAt, remote.lastPlayedAt),
  }
}

/**
 * Забирает список треков с сервера и обновляет кэш.
 *
 * Кэшированные облачные треки, которых больше нет на сервере, удаляются,
 * если за время запроса не было локальных изменений. Локальные треки
 * (source !== 'cloud') не трогаются.
 */
export async function refreshCloudTracks(context: CloudContext): Promise<Track[]> {
  const startSeq = cloudMutationSeq
  let remote: RemoteTrack[]
  try {
    const response = await context.api.listTracks(context.token, context.libraryId)
    remote = response.tracks
  } catch (error) {
    throw cloudError(error)
  }

  assertSameEpoch(context)
  const mapped = remote.map(remoteTrackToTrack)

  await withDatabase((database) =>
    runWriteTransaction(database, ['tracks'], async (transaction) => {
      const store = transaction.objectStore('tracks')
      const existing = await store.getAll()
      const byId = new Map(existing.map((track) => [track.id, track]))
      const remoteIds = new Set(mapped.map((track) => track.id))
      const localChanged = startSeq !== cloudMutationSeq

      if (!localChanged) {
        for (const track of existing) {
          if (track.source === 'cloud' && !remoteIds.has(track.id)) {
            await store.delete(track.id)
          }
        }
      }

      for (const track of mapped) {
        // Удалённый трек может прийти в снапшоте, снятом до удаления.
        if (cloudTombstones.has(track.id)) continue
        const local = byId.get(track.id)
        await store.put(local ? mergeCloudTrack(local, track) : track)
      }
    }),
  )

  return mapped
}

const urlCache = new Map<string, { url: string; expiresAt: number; file: RemoteFile }>()

/** Подписанная ссылка и метаданные файла; ссылка кэшируется до истечения срока. */
export async function resolveCloudFile(
  context: CloudContext,
  fileId: string,
): Promise<{ url: string; file: RemoteFile }> {
  const cached = urlCache.get(fileId)
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return { url: cached.url, file: cached.file }
  }

  try {
    const response = await context.api.fileUrl(context.token, context.libraryId, fileId)
    assertSameEpoch(context)
    const expiresAt = Date.parse(response.expiresAt)
    urlCache.set(fileId, {
      url: response.url,
      expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + 5 * 60_000,
      file: response.file,
    })
    return { url: response.url, file: response.file }
  } catch (error) {
    throw cloudError(error)
  }
}

/** Скачивает файл из аккаунта и кладёт в локальный кэш. */
export async function downloadCloudFile(
  context: CloudContext,
  fileId: string,
): Promise<StoredFile> {
  const existing = await readLocalFile(fileId)
  if (existing) return existing

  const { url, file } = await resolveCloudFile(context, fileId)
  let blob: Blob
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    blob = await response.blob()
  } catch (error) {
    throw cloudError(error)
  }

  const stored: StoredFile = {
    id: fileId,
    kind: file.kind,
    blob,
    mimeType: file.mimeType || blob.type || 'application/octet-stream',
    size: blob.size,
    originalName: file.name || fileId,
    createdAt: new Date().toISOString(),
    cloudUploadedAt: new Date().toISOString(),
    cloudLibraryId: context.libraryId,
  }
  assertSameEpoch(context)
  await writeLocalFile(stored)
  return stored
}

/**
 * Удаляет из кэша треки и файлы, принадлежащие аккаунту.
 * Вызывается при выходе: личная локальная библиотека остаётся на месте.
 */
export async function clearCloudCache(): Promise<void> {
  // Новое поколение: ответы сети, начатые до выхода, уже не применятся.
  cloudEpoch += 1
  cloudMutationSeq += 1
  urlCache.clear()
  cloudTombstones.clear()

  try {
    await withDatabase((database) =>
      runWriteTransaction(database, ['tracks', 'files'], async (transaction) => {
        const trackStore = transaction.objectStore('tracks')
        const fileStore = transaction.objectStore('files')
        const tracks = await trackStore.getAll()

        for (const track of tracks) {
          if (track.source === 'cloud') await trackStore.delete(track.id)
        }

        const remaining = tracks.filter((track) => track.source !== 'cloud')
        const referenced = new Set<string>()
        for (const track of remaining) {
          for (const fileId of fileIdsOf(track)) referenced.add(fileId)
        }

        const files = await fileStore.getAll()
        for (const file of files) {
          if (!referenced.has(file.id) && file.cloudUploadedAt) {
            await fileStore.delete(file.id)
          }
        }
      }),
    )
  } catch {
    // Кэш мог быть недоступен — при следующем входе он соберётся заново.
  }
}

/** Переносит локальный трек в аккаунт и помечает его как облачный. */
export async function migrateTrackToCloud(
  context: CloudContext,
  track: Track,
  onProgress?: (label: string) => void,
): Promise<Track> {
  return pushTrackToCloud(context, track, onProgress)
}
