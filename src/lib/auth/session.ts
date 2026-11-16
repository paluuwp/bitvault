/**
 * Клиентская сессия BitVault: валидация, сериализация и хранение в localStorage.
 *
 * Модуль не делает сетевых вызовов и не зависит от React. Любая запись,
 * которую не удалось разобрать, удаляется из хранилища и не попадает в
 * приложение. Токен и прочие поля сессии никогда не логируются.
 */
import { STORAGE_KEYS } from '../constants'

/** Запас, с которым сессия считается истёкшей до фактического срока. */
export const SESSION_EXPIRY_SKEW_MS = 60_000

/** Максимальный размер сырой записи сессии: 64 КиБ. */
export const SESSION_MAX_RAW_BYTES = 64 * 1024

const TOKEN_MIN_LENGTH = 20
const TOKEN_MAX_LENGTH = 512
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

export interface AuthSessionUser {
  id: string
  email: string
  name: string | null
  picture: string | null
}

export interface AuthSessionLibrary {
  id: string
  name: string
  role: string
}

export interface AuthSession {
  version: 1
  token: string
  expiresAt: string
  user: AuthSessionUser
  libraries: AuthSessionLibrary[]
}

/**
 * Результат чтения без побочных эффектов.
 *
 * `readRaw` не удаляет запись: контекст вызывает его во время рендера, где
 * побочные эффекты недопустимы (в том числе при повторном рендере StrictMode).
 * Причины `expired` и `invalid` контекст обрабатывает сам, вызывая `clear`.
 */
export type SessionReadResult =
  | { status: 'none' }
  | { status: 'valid'; session: AuthSession }
  | { status: 'expired' }
  | { status: 'invalid' }

export interface SessionStore {
  /** Читает валидную сессию; невалидную или истёкшую запись удаляет. */
  read(now?: number): AuthSession | null
  /** Читает запись без изменения хранилища и сообщает причину. */
  readRaw(now?: number): SessionReadResult
  /** Сохраняет сессию; false — хранилище недоступно или запись слишком велика. */
  write(session: AuthSession): boolean
  /** Удаляет запись; не бросает при недоступном хранилище. */
  clear(): void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Проверяет, что значение — ISO-8601-дата, которую принимает `parseSession`. */
export function isIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    ISO_TIMESTAMP_PATTERN.test(value) &&
    Number.isFinite(Date.parse(value))
  )
}

function parseUser(value: unknown): AuthSessionUser | null {
  if (!isRecord(value)) return null
  const { id, email, name, picture } = value
  if (typeof id !== 'string' || id === '') return null
  if (typeof email !== 'string' || !email.includes('@')) return null
  if (name !== null && typeof name !== 'string') return null
  if (picture !== null && typeof picture !== 'string') return null
  return { id, email, name, picture }
}

function parseLibraries(value: unknown): AuthSessionLibrary[] | null {
  if (!Array.isArray(value)) return null
  const items: unknown[] = value
  const result: AuthSessionLibrary[] = []
  for (const item of items) {
    if (!isRecord(item)) return null
    const { id, name, role } = item
    if (typeof id !== 'string' || id === '') return null
    if (typeof name !== 'string' || typeof role !== 'string') return null
    result.push({ id, name, role })
  }
  return result
}

/**
 * Проверяет и нормализует значение из JSON.
 *
 * Возвращает только известные поля, поэтому лишние ключи из хранилища не
 * попадают в состояние приложения.
 */
export function parseSession(value: unknown): AuthSession | null {
  if (!isRecord(value)) return null
  if (value.version !== 1) return null

  const { token, expiresAt } = value
  if (
    typeof token !== 'string' ||
    token.length < TOKEN_MIN_LENGTH ||
    token.length > TOKEN_MAX_LENGTH ||
    !TOKEN_PATTERN.test(token)
  ) {
    return null
  }
  if (!isIsoTimestamp(expiresAt)) return null

  const user = parseUser(value.user)
  if (!user) return null

  const libraries = parseLibraries(value.libraries)
  if (!libraries) return null

  return { version: 1, token, expiresAt, user, libraries }
}

/** Сериализует сессию для localStorage. */
export function serializeSession(session: AuthSession): string {
  return JSON.stringify(session)
}

/**
 * Считает сессию истёкшей с запасом `skewMs` (по умолчанию 60 секунд).
 *
 * Сессия считается истёкшей, когда `now + skewMs >= expiresAt`, то есть
 * ровно на границе запаса. Невалидная дата трактуется как истёкшая.
 */
export function isSessionExpired(
  session: AuthSession,
  now: number = Date.now(),
  skewMs: number = SESSION_EXPIRY_SKEW_MS,
): boolean {
  const expiresAt = Date.parse(session.expiresAt)
  if (!Number.isFinite(expiresAt)) return true
  return now + Math.max(0, skewMs) >= expiresAt
}

function resolveDefaultStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage
  } catch {
    // Доступ к localStorage может быть запрещён политикой браузера.
    return null
  }
}

let textEncoder: TextEncoder | undefined

function utf8ByteLength(value: string): number {
  if (typeof TextEncoder === 'undefined') return value.length * 2
  textEncoder ??= new TextEncoder()
  return textEncoder.encode(value).length
}

function isTooLarge(raw: string): boolean {
  // Быстрая проверка по длине: UTF-8 занимает не меньше байт, чем код-юнитов.
  if (raw.length > SESSION_MAX_RAW_BYTES) return true
  return utf8ByteLength(raw) > SESSION_MAX_RAW_BYTES
}

/**
 * Создаёт хранилище сессии поверх переданного Storage.
 *
 * Если аргумент не передан, используется window.localStorage. Явный `null`
 * означает «хранилища нет»: чтение возвращает null, запись — false, а clear()
 * ничего не делает и не трогает localStorage. Чтение и запись никогда не
 * бросают: недоступное или переполненное хранилище приводит к null/false.
 */
export function createSessionStore(storage?: Storage | null): SessionStore {
  const target = storage === undefined ? resolveDefaultStorage() : storage

  const remove = (): void => {
    if (!target) return
    try {
      target.removeItem(STORAGE_KEYS.authSession)
    } catch {
      // Удалить запись не удалось — при следующем чтении она будет отброшена.
    }
  }

  const readRaw = (now: number = Date.now()): SessionReadResult => {
    if (!target) return { status: 'none' }

    let raw: string | null
    try {
      raw = target.getItem(STORAGE_KEYS.authSession)
    } catch {
      return { status: 'none' }
    }
    if (raw === null) return { status: 'none' }
    if (typeof raw !== 'string' || isTooLarge(raw)) return { status: 'invalid' }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return { status: 'invalid' }
    }

    const session = parseSession(parsed)
    if (!session) return { status: 'invalid' }
    if (isSessionExpired(session, now)) return { status: 'expired' }
    return { status: 'valid', session }
  }

  const read = (now: number = Date.now()): AuthSession | null => {
    const result = readRaw(now)
    if (result.status === 'valid') return result.session
    if (result.status !== 'none') remove()
    return null
  }

  const write = (session: AuthSession): boolean => {
    if (!target) return false

    let raw: string
    try {
      raw = serializeSession(session)
    } catch {
      return false
    }
    if (isTooLarge(raw)) return false

    try {
      target.setItem(STORAGE_KEYS.authSession, raw)
      return true
    } catch {
      // QuotaExceededError, приватный режим, запрет записи — просто не сохраняем.
      return false
    }
  }

  const clear = (): void => {
    remove()
  }

  return { read, readRaw, write, clear }
}
