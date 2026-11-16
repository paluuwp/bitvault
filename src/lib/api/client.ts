import { RemoteApiError, errorCodeFromStatus, isApiErrorCode } from './errors'
import type { AuthMessageContext } from './messages'
import { messageForFailure } from './messages'
import type {
  ApiErrorCode,
  LoginResponse,
  MeResponse,
  RemoteFile,
  RemoteFileUrlResponse,
  RemoteLibrary,
  RemoteTrack,
  RemoteTrackInput,
  RemoteTracksResponse,
  RemoteUser,
} from './types'

const DEFAULT_TIMEOUT_MS = 15_000
/** Количество попыток по умолчанию для обычных запросов. */
const DEFAULT_ATTEMPTS = 3
/** Базовая задержка перед повтором; растёт экспоненциально. */
const DEFAULT_RETRY_DELAY_MS = 400

export interface CreateRemoteApiOptions {
  /** Базовый URL API, например https://host/api/v1 (без завершающего слэша). */
  baseUrl: string
  /** Инъекция fetch для тестов; по умолчанию используется глобальный fetch. */
  fetchImpl?: typeof fetch
  /** Таймаут запроса в миллисекундах. */
  timeoutMs?: number
  /** Базовая задержка перед повтором в миллисекундах; по умолчанию 400. */
  retryDelayMs?: number
}

export interface RemoteApi {
  loginWithGoogle(credential: string): Promise<LoginResponse>
  me(token: string): Promise<MeResponse>
  logout(token: string): Promise<void>
  logoutAll(token: string): Promise<void>
  listTracks(token: string, libraryId: string): Promise<RemoteTracksResponse>
  putTrack(token: string, libraryId: string, trackId: string, track: RemoteTrackInput): Promise<RemoteTrack>
  deleteTrack(token: string, libraryId: string, trackId: string): Promise<void>
  uploadFile(
    token: string,
    libraryId: string,
    fileId: string,
    body: Blob,
    options: { kind: RemoteFile['kind']; name: string; mimeType: string },
  ): Promise<RemoteFile>
  fileUrl(token: string, libraryId: string, fileId: string): Promise<RemoteFileUrlResponse>
}

interface RequestSpec {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  headers: Record<string, string>
  body?: string | Blob
  context: AuthMessageContext
  /** Переопределение таймаута для длинных запросов (загрузка файлов). */
  timeoutMs?: number
  /** Число попыток; по умолчанию DEFAULT_ATTEMPTS. */
  attempts?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isAbortError(error: unknown): boolean {
  return isRecord(error) && error.name === 'AbortError'
}

function failureError(
  failure: 'network' | 'timeout' | 'parse',
  context: AuthMessageContext,
  cause?: unknown,
): RemoteApiError {
  return new RemoteApiError(failure, messageForFailure(failure, context), { cause })
}

function httpError(
  code: ApiErrorCode | undefined,
  status: number,
  context: AuthMessageContext,
): RemoteApiError {
  return new RemoteApiError('http', messageForFailure('http', context, code), { code, status })
}

/** Временной сбой: имеет смысл повторить запрос. */
function isRetryableFailure(error: unknown): boolean {
  return (
    error instanceof RemoteApiError &&
    (error.failure === 'network' || error.failure === 'timeout')
  )
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * Создаёт отправитель запросов с таймаутом и повторами.
 *
 * Одна попытка (`sendOnce`) реализует таймаут через AbortController и гонку
 * промисов: даже если инъецированный fetch игнорирует signal, запрос завершится
 * ошибкой timeout. Таймер всегда очищается.
 *
 * Обёртка `send` повторяет попытку только при сетевом сбое или таймауте —
 * HTTP-ошибки и ошибки разбора не повторяются. Задержка между попытками растёт
 * экспоненциально: retryDelayMs * 3 ** (attempt - 1).
 */
function createSender(
  baseUrl: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  retryDelayMs: number,
): (spec: RequestSpec) => Promise<Response> {
  async function sendOnce(spec: RequestSpec): Promise<Response> {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined

    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(failureError('timeout', spec.context))
      }, spec.timeoutMs ?? timeoutMs)
    })

    try {
      return await Promise.race([
        fetchImpl(`${baseUrl}${spec.path}`, {
          method: spec.method,
          headers: spec.headers,
          body: spec.body,
          mode: 'cors',
          credentials: 'omit',
          cache: 'no-store',
          signal: controller.signal,
        }),
        timeoutPromise,
      ])
    } catch (error) {
      if (error instanceof RemoteApiError) throw error
      if (isAbortError(error)) throw failureError('timeout', spec.context, error)
      throw failureError('network', spec.context, error)
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }

  return async function send(spec: RequestSpec): Promise<Response> {
    const attempts = spec.attempts ?? DEFAULT_ATTEMPTS
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await sendOnce(spec)
      } catch (error) {
        // На последней попытке (или при неретраибельной ошибке) пробрасываем
        // исходную ошибку без изменений.
        if (attempt >= attempts || !isRetryableFailure(error)) throw error
        await delay(retryDelayMs * 3 ** (attempt - 1))
      }
    }
  }
}

async function readJson(response: Response, context: AuthMessageContext): Promise<unknown> {
  try {
    const data: unknown = await response.json()
    return data
  } catch {
    // Тело ответа может содержать чувствительные данные — cause не сохраняем.
    throw failureError('parse', context)
  }
}

/**
 * Разбирает конверт ошибки { error: { code, message } }.
 * Код принимается только из списка допустимых, иначе используется статус.
 */
async function httpErrorFromResponse(
  response: Response,
  context: AuthMessageContext,
): Promise<RemoteApiError> {
  let code: ApiErrorCode | undefined
  try {
    const text = await response.text()
    if (text.trim()) {
      const parsed: unknown = JSON.parse(text)
      if (isRecord(parsed) && isRecord(parsed.error)) {
        const envelopeCode = parsed.error.code
        if (isApiErrorCode(envelopeCode)) code = envelopeCode
      }
    }
  } catch {
    // Не JSON или тело недоступно — остаётся маппинг по HTTP-статусу.
  }
  return httpError(code ?? errorCodeFromStatus(response.status), response.status, context)
}

function parseRemoteUser(value: unknown): RemoteUser | null {
  if (!isRecord(value)) return null
  const { id, email, name, picture } = value
  if (typeof id !== 'string' || id === '') return null
  if (typeof email !== 'string' || email === '') return null
  if (name !== null && name !== undefined && typeof name !== 'string') return null
  if (picture !== null && picture !== undefined && typeof picture !== 'string') return null
  return {
    id,
    email,
    name: typeof name === 'string' ? name : null,
    picture: typeof picture === 'string' ? picture : null,
  }
}

function parseRemoteLibrary(value: unknown): RemoteLibrary | null {
  if (!isRecord(value)) return null
  const { id, name, role } = value
  if (typeof id !== 'string' || id === '') return null
  if (typeof name !== 'string') return null
  if (typeof role !== 'string') return null
  return { id, name, role }
}

function parseLibraries(value: unknown): RemoteLibrary[] | null {
  if (!Array.isArray(value)) return null
  const items: unknown[] = value
  const result: RemoteLibrary[] = []
  for (const item of items) {
    const library = parseRemoteLibrary(item)
    if (!library) return null
    result.push(library)
  }
  return result
}

function parseLoginResponse(value: unknown, context: AuthMessageContext): LoginResponse {
  if (!isRecord(value)) throw failureError('parse', context)
  const { token, expiresAt } = value
  const user = parseRemoteUser(value.user)
  const libraries = parseLibraries(value.libraries)
  if (
    typeof token !== 'string' ||
    token === '' ||
    typeof expiresAt !== 'string' ||
    expiresAt === '' ||
    !user ||
    !libraries
  ) {
    throw failureError('parse', context)
  }
  return { token, expiresAt, user, libraries }
}

function parseMeResponse(value: unknown, context: AuthMessageContext): MeResponse {
  if (!isRecord(value)) throw failureError('parse', context)
  const user = parseRemoteUser(value.user)
  const libraries = parseLibraries(value.libraries)
  if (!user || !libraries) throw failureError('parse', context)

  // Поле появилось в новых версиях Worker; старые его не присылают.
  // Валидность даты проверяет контекст сессии, здесь сохраняем как есть.
  const { expiresAt } = value
  if (typeof expiresAt === 'string' && expiresAt !== '') {
    return { user, libraries, expiresAt }
  }
  return { user, libraries }
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, Accept: 'application/json' }
}

const FILE_KINDS = ['audio', 'cover', 'attachment'] as const
/** Загрузка файла может идти минутами: отдельный таймаут. */
const UPLOAD_TIMEOUT_MS = 10 * 60 * 1000
/** Тело загрузки большое, каждая попытка дорогая — не больше двух. */
const UPLOAD_ATTEMPTS = 2

function parseRemoteFile(value: unknown): RemoteFile | null {
  if (!isRecord(value)) return null
  const { id, kind, name, mimeType, size } = value
  if (typeof id !== 'string' || id === '') return null
  if (typeof kind !== 'string' || !(FILE_KINDS as readonly string[]).includes(kind)) return null
  if (typeof name !== 'string') return null
  if (typeof mimeType !== 'string') return null
  if (typeof size !== 'number' || !Number.isFinite(size) || size < 0) return null
  return { id, kind: kind as RemoteFile['kind'], name, mimeType, size }
}

function parseOptionalFile(value: unknown): RemoteFile | null | undefined {
  if (value === null || value === undefined) return null
  return parseRemoteFile(value) ?? undefined
}

function parseStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const items: unknown[] = value
  if (!items.every((item) => typeof item === 'string')) return null
  return items as string[]
}

function parseOptionalString(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null
  return typeof value === 'string' ? value : undefined
}

function parseOptionalNumber(value: unknown): number | null | undefined {
  if (value === null || value === undefined) return null
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function parseRemoteTrack(value: unknown): RemoteTrack | null {
  if (!isRecord(value)) return null
  const { id, name, isFavorite, notes, color, createdAt, updatedAt, playCount, tags } = value

  if (typeof id !== 'string' || id === '') return null
  if (typeof name !== 'string') return null
  if (typeof notes !== 'string') return null
  if (typeof color !== 'string') return null
  if (typeof isFavorite !== 'boolean') return null
  if (typeof createdAt !== 'string' || typeof updatedAt !== 'string') return null
  if (typeof playCount !== 'number' || !Number.isFinite(playCount)) return null

  const parsedTags = parseStringArray(tags)
  const bpm = parseOptionalNumber(value.bpm)
  const musicalKey = parseOptionalString(value.musicalKey)
  const genre = parseOptionalString(value.genre)
  const durationSec = parseOptionalNumber(value.durationSec)
  const lastPlayedAt = parseOptionalString(value.lastPlayedAt)
  const audioFile = parseOptionalFile(value.audioFile)
  const coverFile = parseOptionalFile(value.coverFile)
  const attachments = Array.isArray(value.attachments)
    ? value.attachments.map(parseRemoteFile)
    : null
  if (
    !parsedTags ||
    bpm === undefined ||
    musicalKey === undefined ||
    genre === undefined ||
    durationSec === undefined ||
    lastPlayedAt === undefined ||
    audioFile === undefined ||
    coverFile === undefined ||
    !attachments ||
    attachments.some((file) => file === null)
  ) {
    return null
  }

  return {
    id,
    name,
    bpm,
    musicalKey,
    genre,
    tags: parsedTags,
    notes,
    color,
    isFavorite,
    durationSec,
    createdAt,
    updatedAt,
    lastPlayedAt,
    playCount,
    audioFile,
    coverFile,
    attachments: attachments as RemoteFile[],
  }
}

function parseTracksResponse(value: unknown, context: AuthMessageContext): RemoteTracksResponse {
  if (!isRecord(value)) throw failureError('parse', context)
  const library = parseRemoteLibrary(value.library)
  const rawTracks = value.tracks
  if (!library || !Array.isArray(rawTracks)) throw failureError('parse', context)

  const tracks: RemoteTrack[] = []
  for (const item of rawTracks) {
    const track = parseRemoteTrack(item)
    if (!track) throw failureError('parse', context)
    tracks.push(track)
  }
  return { library, tracks }
}

function parseTrack(value: unknown, context: AuthMessageContext): RemoteTrack {
  const track = parseRemoteTrack(value)
  if (!track) throw failureError('parse', context)
  return track
}

function parseFile(value: unknown, context: AuthMessageContext): RemoteFile {
  const file = parseRemoteFile(value)
  if (!file) throw failureError('parse', context)
  return file
}

function parseFileUrlResponse(value: unknown, context: AuthMessageContext): RemoteFileUrlResponse {
  if (!isRecord(value)) throw failureError('parse', context)
  const { url, expiresAt } = value
  const file = parseRemoteFile(value.file)
  if (typeof url !== 'string' || url === '' || typeof expiresAt !== 'string' || !file) {
    throw failureError('parse', context)
  }
  return { url, expiresAt, file }
}

function trackFilePath(libraryId: string, suffix: string): string {
  return `/libraries/${encodeURIComponent(libraryId)}${suffix}`
}

/**
 * Проверяет базовый URL и убирает завершающие слэши.
 *
 * Нужен абсолютный http(s)-URL с хостом. Пустое или относительное значение
 * означает некорректную конфигурацию: клиент не должен отправлять токены на
 * origin приложения, поэтому создание клиента завершается обычной Error
 * (не RemoteApiError — это не сбой запроса).
 */
function normalizeBaseUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, '')
  if (!normalized) throw new Error('baseUrl обязателен')

  let parsed: URL
  try {
    parsed = new URL(normalized)
  } catch {
    throw new Error('baseUrl обязателен')
  }
  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !parsed.hostname) {
    throw new Error('baseUrl обязателен')
  }
  return normalized
}

/** Создаёт HTTP-клиент к Worker API. Секреты и тела запросов не логируются. */
export function createRemoteApi(options: CreateRemoteApiOptions): RemoteApi {
  const baseUrl = normalizeBaseUrl(options.baseUrl)
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
  const send = createSender(baseUrl, fetchImpl, timeoutMs, retryDelayMs)

  return {
    async loginWithGoogle(credential: string): Promise<LoginResponse> {
      const response = await send({
        method: 'POST',
        path: '/auth/google',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ credential }),
        context: 'login',
      })
      if (!response.ok) throw await httpErrorFromResponse(response, 'login')
      const data = await readJson(response, 'login')
      return parseLoginResponse(data, 'login')
    },

    async me(token: string): Promise<MeResponse> {
      const response = await send({
        method: 'GET',
        path: '/auth/me',
        headers: authHeaders(token),
        context: 'refresh',
      })
      if (!response.ok) throw await httpErrorFromResponse(response, 'refresh')
      const data = await readJson(response, 'refresh')
      return parseMeResponse(data, 'refresh')
    },

    async logout(token: string): Promise<void> {
      const response = await send({
        method: 'POST',
        path: '/auth/logout',
        headers: authHeaders(token),
        context: 'logout',
        // Сессия уже отозвана на сервере; повтор с тем же токеном даст 401
        // и лишнюю ошибку в интерфейсе.
        attempts: 1,
      })
      if (!response.ok) throw await httpErrorFromResponse(response, 'logout')
      // 204 — успех без тела.
    },

    async logoutAll(token: string): Promise<void> {
      const response = await send({
        method: 'POST',
        path: '/auth/logout-all',
        headers: authHeaders(token),
        context: 'logout',
        attempts: 1,
      })
      if (!response.ok) throw await httpErrorFromResponse(response, 'logout')
      // 204 — успех без тела.
    },

    async listTracks(token: string, libraryId: string): Promise<RemoteTracksResponse> {
      const response = await send({
        method: 'GET',
        path: trackFilePath(libraryId, '/tracks'),
        headers: authHeaders(token),
        context: 'library',
      })
      if (!response.ok) throw await httpErrorFromResponse(response, 'library')
      return parseTracksResponse(await readJson(response, 'library'), 'library')
    },

    async putTrack(
      token: string,
      libraryId: string,
      trackId: string,
      track: RemoteTrackInput,
    ): Promise<RemoteTrack> {
      const response = await send({
        method: 'PUT',
        path: trackFilePath(libraryId, `/tracks/${encodeURIComponent(trackId)}`),
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify(track),
        context: 'library',
      })
      if (!response.ok) throw await httpErrorFromResponse(response, 'library')
      return parseTrack(await readJson(response, 'library'), 'library')
    },

    async deleteTrack(token: string, libraryId: string, trackId: string): Promise<void> {
      const response = await send({
        method: 'DELETE',
        path: trackFilePath(libraryId, `/tracks/${encodeURIComponent(trackId)}`),
        headers: authHeaders(token),
        context: 'library',
      })
      if (!response.ok) throw await httpErrorFromResponse(response, 'library')
      // 204 — успех без тела.
    },

    async uploadFile(
      token: string,
      libraryId: string,
      fileId: string,
      body: Blob,
      options: { kind: RemoteFile['kind']; name: string; mimeType: string },
    ): Promise<RemoteFile> {
      const query = `?kind=${encodeURIComponent(options.kind)}&name=${encodeURIComponent(options.name)}`
      const response = await send({
        method: 'PUT',
        path: trackFilePath(libraryId, `/files/${encodeURIComponent(fileId)}${query}`),
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': options.mimeType || 'application/octet-stream',
        },
        body,
        context: 'library',
        timeoutMs: UPLOAD_TIMEOUT_MS,
        attempts: UPLOAD_ATTEMPTS,
      })
      if (!response.ok) throw await httpErrorFromResponse(response, 'library')
      return parseFile(await readJson(response, 'library'), 'library')
    },

    async fileUrl(
      token: string,
      libraryId: string,
      fileId: string,
    ): Promise<RemoteFileUrlResponse> {
      const response = await send({
        method: 'GET',
        path: trackFilePath(libraryId, `/files/${encodeURIComponent(fileId)}/url`),
        headers: authHeaders(token),
        context: 'library',
      })
      if (!response.ok) throw await httpErrorFromResponse(response, 'library')
      return parseFileUrlResponse(await readJson(response, 'library'), 'library')
    },
  }
}
