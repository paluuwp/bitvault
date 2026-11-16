export const DEFAULT_LIBRARY_NAME = 'Моя библиотека'

export interface UserRecord {
  id: string
  googleSub: string
  email: string
  name: string | null
  picture: string | null
  createdAt: string
  lastSeenAt: string
}

export interface LibraryRecord {
  id: string
  ownerUserId: string
  name: string
  createdAt: string
  updatedAt: string
  version: number
}

export interface LibraryWithRole extends LibraryRecord {
  role: string
}

export interface SessionRecord {
  id: string
  userId: string
  tokenHash: string
  createdAt: string
  expiresAt: string
  lastUsedAt: string
  userAgent: string | null
}

export interface UpsertUserInput {
  googleSub: string
  email: string
  name: string | null
  picture: string | null
  now: string
}

export interface CreateSessionInput {
  id: string
  userId: string
  tokenHash: string
  createdAt: string
  expiresAt: string
  userAgent: string | null
}

export interface TouchSessionInput {
  sessionId: string
  now: string
  nextExpiresAt: string
  /** Продлевать только если last_used_at < staleBefore (не чаще раза в сутки). */
  staleBefore: string
}

export interface Store {
  findUserByGoogleSub(googleSub: string): Promise<UserRecord | null>
  findUserById(id: string): Promise<UserRecord | null>
  upsertUser(input: UpsertUserInput): Promise<UserRecord>
  /** Идемпотентно: id = `lib_<userId>`, владелец получает роль owner. */
  createPersonalLibrary(userId: string, now: string, name?: string): Promise<LibraryRecord>
  listLibrariesForUser(userId: string): Promise<LibraryWithRole[]>
  createSession(input: CreateSessionInput): Promise<SessionRecord>
  findSessionByHash(tokenHash: string): Promise<SessionRecord | null>
  /** Возвращает true, если сессия была продлена. */
  touchSession(input: TouchSessionInput): Promise<boolean>
  deleteSession(sessionId: string): Promise<void>
  deleteUserSessions(userId: string): Promise<void>
  /** Оставляет не больше `keep` последних сессий пользователя, остальные удаляет. */
  pruneUserSessions(userId: string, keep: number): Promise<void>
  /** Удаляет истёкшие сессии и возвращает число удалённых. */
  deleteExpiredSessions(now: string): Promise<number>
  /**
   * Fixed-window счётчик: увеличивает count для ключа в окне windowStartSec.
   * Возвращает true, если count не превышает limit.
   */
  hitRateLimit(key: string, windowStartSec: number, limit: number): Promise<boolean>
  /** Удаляет счётчики окон старше olderThanSec и возвращает число удалённых. */
  cleanupRateLimits(olderThanSec: number): Promise<number>
}
