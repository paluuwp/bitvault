import { RemoteApiError, errorCodeFromStatus, isApiErrorCode } from './errors'
import type { AuthMessageContext } from './messages'
import { messageForFailure } from './messages'
import type {
  ApiErrorCode,
  LoginResponse,
  MeResponse,
  RemoteLibrary,
  RemoteUser,
} from './types'

const DEFAULT_TIMEOUT_MS = 15_000

export interface CreateRemoteApiOptions {
  /** Базовый URL API, например https://host/api/v1 (без завершающего слэша). */
  baseUrl: string
  /** Инъекция fetch для тестов; по умолчанию используется глобальный fetch. */
  fetchImpl?: typeof fetch
  /** Таймаут запроса в миллисекундах. */
  timeoutMs?: number
}

export interface RemoteApi {
  loginWithGoogle(credential: string): Promise<LoginResponse>
  me(token: string): Promise<MeResponse>
  logout(token: string): Promise<void>
  logoutAll(token: string): Promise<void>
}

interface RequestSpec {
  method: 'GET' | 'POST'
  path: string
  headers: Record<string, string>
  body?: string
  context: AuthMessageContext
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

/**
 * Выполняет запрос с таймаутом.
 *
 * Таймаут реализован через AbortController и гонку промисов: даже если
 * инъецированный fetch игнорирует signal, запрос завершится ошибкой timeout.
 * Таймер всегда очищается, ретраев нет.
 */
function createSender(
  baseUrl: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): (spec: RequestSpec) => Promise<Response> {
  return async function send(spec: RequestSpec): Promise<Response> {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined

    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(failureError('timeout', spec.context))
      }, timeoutMs)
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
  const send = createSender(baseUrl, fetchImpl, timeoutMs)

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
      })
      if (!response.ok) throw await httpErrorFromResponse(response, 'logout')
      // 204 — успех без тела.
    },
  }
}
