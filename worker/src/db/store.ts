export const DEFAULT_LIBRARY_NAME = 'Моя библиотека'
/** Цвет трека по умолчанию — совпадает с клиентской палитрой. */
export const DEFAULT_TRACK_COLOR = '#D8FF3E'

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

/** Файл библиотеки: байты лежат в приватном R2 по ключу r2Key. */
export interface FileRecord {
  id: string
  libraryId: string
  kind: string
  r2Key: string
  mimeType: string | null
  size: number | null
  originalName: string | null
  createdAt: string | null
  deletedAt: string | null
}

export interface TrackRecord {
  id: string
  libraryId: string
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
  audioFileId: string | null
  coverFileId: string | null
  deletedAt: string | null
}

/** Трек с присоединёнными неудалёнными файлами библиотеки. */
export interface TrackWithFiles extends TrackRecord {
  audioFile: FileRecord | null
  coverFile: FileRecord | null
  attachments: FileRecord[]
}

export interface UpsertTrackInput {
  id: string
  libraryId: string
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

export interface UpsertFileInput {
  id: string
  libraryId: string
  kind: string
  r2Key: string
  mimeType: string | null
  size: number | null
  originalName: string | null
  now: string
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
  /** Библиотека с ролью пользователя или null, если членства нет. */
  findLibraryForUser(libraryId: string, userId: string): Promise<LibraryWithRole | null>
  /** Неудалённые треки библиотеки вместе с аудио, обложкой и вложениями. */
  listTracksForLibrary(libraryId: string): Promise<TrackWithFiles[]>
  /**
   * Upsert трека по id: обновляет существующий или создаёт новый, заменяет
   * вложения. play_count/last_played_at существующего трека сохраняются.
   * null — id уже занят треком другой библиотеки.
   */
  upsertTrack(input: UpsertTrackInput): Promise<TrackRecord | null>
  /** Мягкое удаление; повторный вызов ничего не меняет. */
  softDeleteTrack(libraryId: string, trackId: string, now: string): Promise<void>
  /** Upsert файла по id; перезапись в той же библиотеке допустима. null — чужая библиотека. */
  upsertFile(input: UpsertFileInput): Promise<FileRecord | null>
  /** Ищет файл по id, включая мягко удалённые. */
  findFileById(fileId: string): Promise<FileRecord | null>
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
