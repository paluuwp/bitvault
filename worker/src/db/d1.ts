import { createId } from '../lib/ids'
import { DEFAULT_LIBRARY_NAME, DEFAULT_TRACK_COLOR } from './store'
import type {
  CreateSessionInput,
  FileRecord,
  LibraryRecord,
  LibraryWithRole,
  SessionRecord,
  Store,
  TouchSessionInput,
  TrackRecord,
  TrackWithFiles,
  UpsertFileInput,
  UpsertTrackInput,
  UpsertUserInput,
  UserRecord,
} from './store'

interface UserRow {
  id: string
  google_sub: string
  email: string
  name: string | null
  picture: string | null
  created_at: string
  last_seen_at: string
}

interface LibraryRow {
  id: string
  owner_user_id: string
  name: string
  created_at: string
  updated_at: string
  version: number
}

interface LibraryWithRoleRow extends LibraryRow {
  role: string
}

interface SessionRow {
  id: string
  user_id: string
  token_hash: string
  created_at: string
  expires_at: string
  last_used_at: string
  user_agent: string | null
}

interface FileRow {
  id: string
  library_id: string
  kind: string
  r2_key: string
  mime_type: string | null
  size: number | null
  original_name: string | null
  created_at: string | null
  deleted_at: string | null
}

interface TrackRow {
  id: string
  library_id: string
  name: string | null
  bpm: number | null
  musical_key: string | null
  genre: string | null
  author: string | null
  tags_json: string | null
  notes: string | null
  color: string | null
  is_favorite: number | null
  duration_sec: number | null
  play_count: number | null
  last_played_at: string | null
  created_at: string | null
  updated_at: string | null
  audio_file_id: string | null
  cover_file_id: string | null
  deleted_at: string | null
}

/** Строка второй выборки: файл в контексте трека (аудио, обложка или вложение). */
interface TrackFileRow extends FileRow {
  track_id: string
  position: number | null
  usage: string
}

function toUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    googleSub: row.google_sub,
    email: row.email,
    name: row.name,
    picture: row.picture,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
  }
}

function toLibrary(row: LibraryRow): LibraryRecord {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
  }
}

function toSession(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
    userAgent: row.user_agent,
  }
}

function parseTags(raw: string | null): string[] {
  if (!raw) return []
  try {
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value)) return []
    return value.filter((item): item is string => typeof item === 'string')
  } catch {
    return []
  }
}

function toTrack(row: TrackRow): TrackRecord {
  return {
    id: row.id,
    libraryId: row.library_id,
    name: row.name ?? '',
    bpm: row.bpm,
    musicalKey: row.musical_key,
    genre: row.genre,
    author: row.author ?? null,
    tags: parseTags(row.tags_json),
    notes: row.notes ?? '',
    color: row.color ?? DEFAULT_TRACK_COLOR,
    isFavorite: (row.is_favorite ?? 0) !== 0,
    durationSec: row.duration_sec,
    createdAt: row.created_at ?? '',
    updatedAt: row.updated_at ?? '',
    lastPlayedAt: row.last_played_at,
    playCount: row.play_count ?? 0,
    audioFileId: row.audio_file_id,
    coverFileId: row.cover_file_id,
    deletedAt: row.deleted_at,
  }
}

function toFile(row: FileRow): FileRecord {
  return {
    id: row.id,
    libraryId: row.library_id,
    kind: row.kind,
    r2Key: row.r2_key,
    mimeType: row.mime_type,
    size: row.size,
    originalName: row.original_name,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  }
}

const USER_COLUMNS = 'id, google_sub, email, name, picture, created_at, last_seen_at'
const LIBRARY_COLUMNS = 'id, owner_user_id, name, created_at, updated_at, version'
const SESSION_COLUMNS = 'id, user_id, token_hash, created_at, expires_at, last_used_at, user_agent'
const FILE_COLUMNS =
  'id, library_id, kind, r2_key, mime_type, size, original_name, created_at, deleted_at'
const TRACK_COLUMNS =
  'id, library_id, name, bpm, musical_key, genre, author, tags_json, notes, color, is_favorite, ' +
  'duration_sec, play_count, last_played_at, created_at, updated_at, audio_file_id, ' +
  'cover_file_id, deleted_at'
const TRACK_FILE_COLUMNS =
  'f.id, f.library_id, f.kind, f.r2_key, f.mime_type, f.size, f.original_name, ' +
  'f.created_at, f.deleted_at'

/** Store поверх D1: только prepared statements, без склейки SQL строками. */
export class D1Store implements Store {
  constructor(private readonly db: D1Database) {}

  async findUserByGoogleSub(googleSub: string): Promise<UserRecord | null> {
    const row = await this.db
      .prepare(`SELECT ${USER_COLUMNS} FROM users WHERE google_sub = ?`)
      .bind(googleSub)
      .first<UserRow>()
    return row ? toUser(row) : null
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    const row = await this.db
      .prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`)
      .bind(id)
      .first<UserRow>()
    return row ? toUser(row) : null
  }

  async upsertUser(input: UpsertUserInput): Promise<UserRecord> {
    const result = await this.db
      .prepare(
        `INSERT INTO users (id, google_sub, email, name, picture, created_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(google_sub) DO UPDATE SET
           email = excluded.email,
           name = excluded.name,
           picture = excluded.picture,
           last_seen_at = excluded.last_seen_at
         RETURNING ${USER_COLUMNS}`,
      )
      .bind(
        createId('usr'),
        input.googleSub,
        input.email,
        input.name,
        input.picture,
        input.now,
        input.now,
      )
      .all<UserRow>()
    const row = result.results[0]
    if (!row) throw new Error('Не удалось сохранить пользователя.')
    return toUser(row)
  }

  async createPersonalLibrary(
    userId: string,
    now: string,
    name: string = DEFAULT_LIBRARY_NAME,
  ): Promise<LibraryRecord> {
    const libraryId = `lib_${userId}`
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO libraries (id, owner_user_id, name, created_at, updated_at, version)
           VALUES (?, ?, ?, ?, ?, 1)
           ON CONFLICT(id) DO NOTHING`,
        )
        .bind(libraryId, userId, name, now, now),
      this.db
        .prepare(
          `INSERT INTO library_members (library_id, user_id, role, created_at)
           VALUES (?, ?, 'owner', ?)
           ON CONFLICT(library_id, user_id) DO NOTHING`,
        )
        .bind(libraryId, userId, now),
    ])

    const row = await this.db
      .prepare(`SELECT ${LIBRARY_COLUMNS} FROM libraries WHERE id = ?`)
      .bind(libraryId)
      .first<LibraryRow>()
    if (!row) throw new Error('Не удалось создать личную библиотеку.')
    return toLibrary(row)
  }

  async listLibrariesForUser(userId: string): Promise<LibraryWithRole[]> {
    const result = await this.db
      .prepare(
        `SELECT l.id, l.owner_user_id, l.name, l.created_at, l.updated_at, l.version, m.role
         FROM library_members m
         JOIN libraries l ON l.id = m.library_id
         WHERE m.user_id = ?
         ORDER BY l.created_at ASC, l.id ASC`,
      )
      .bind(userId)
      .all<LibraryWithRoleRow>()
    return result.results.map((row) => ({ ...toLibrary(row), role: row.role }))
  }

  async findLibraryForUser(libraryId: string, userId: string): Promise<LibraryWithRole | null> {
    const row = await this.db
      .prepare(
        `SELECT l.id, l.owner_user_id, l.name, l.created_at, l.updated_at, l.version, m.role
         FROM library_members m
         JOIN libraries l ON l.id = m.library_id
         WHERE m.library_id = ? AND m.user_id = ?`,
      )
      .bind(libraryId, userId)
      .first<LibraryWithRoleRow>()
    return row ? { ...toLibrary(row), role: row.role } : null
  }

  async listTracksForLibrary(libraryId: string): Promise<TrackWithFiles[]> {
    const trackResult = await this.db
      .prepare(
        `SELECT ${TRACK_COLUMNS} FROM tracks
         WHERE library_id = ? AND deleted_at IS NULL
         ORDER BY created_at DESC, id ASC`,
      )
      .bind(libraryId)
      .all<TrackRow>()

    // Второй запрос: все файлы треков библиотеки (аудио, обложка, вложения)
    // одним UNION ALL — без N+1 по трекам.
    const fileResult = await this.db
      .prepare(
        `SELECT t.id AS track_id, 0 AS position, 'audio' AS usage, ${TRACK_FILE_COLUMNS}
         FROM tracks t
         JOIN files f ON f.id = t.audio_file_id
           AND f.library_id = t.library_id AND f.deleted_at IS NULL
         WHERE t.library_id = ? AND t.deleted_at IS NULL
         UNION ALL
         SELECT t.id, 0, 'cover', ${TRACK_FILE_COLUMNS}
         FROM tracks t
         JOIN files f ON f.id = t.cover_file_id
           AND f.library_id = t.library_id AND f.deleted_at IS NULL
         WHERE t.library_id = ? AND t.deleted_at IS NULL
         UNION ALL
         SELECT ta.track_id, ta.position, 'attachment', ${TRACK_FILE_COLUMNS}
         FROM track_attachments ta
         JOIN tracks t ON t.id = ta.track_id AND t.library_id = ? AND t.deleted_at IS NULL
         JOIN files f ON f.id = ta.file_id
           AND f.library_id = t.library_id AND f.deleted_at IS NULL
         ORDER BY 1, 3, 2, 4`,
      )
      .bind(libraryId, libraryId, libraryId)
      .all<TrackFileRow>()

    const tracks: TrackWithFiles[] = trackResult.results.map((row) => ({
      ...toTrack(row),
      audioFile: null,
      coverFile: null,
      attachments: [],
    }))
    const byId = new Map(tracks.map((track) => [track.id, track]))

    for (const row of fileResult.results) {
      const track = byId.get(row.track_id)
      if (!track) continue
      const file = toFile(row)
      if (row.usage === 'audio') {
        track.audioFile = file
      } else if (row.usage === 'cover') {
        track.coverFile = file
      } else {
        track.attachments.push(file)
      }
    }

    return tracks
  }

  async upsertTrack(input: UpsertTrackInput): Promise<TrackRecord | null> {
    const upsert = this.db
      .prepare(
        `INSERT INTO tracks (
           id, library_id, name, name_lower, bpm, musical_key, genre, tags_json, notes,
           color, is_favorite, duration_sec, play_count, last_played_at, created_at,
           updated_at, version, deleted_at, audio_file_id, cover_file_id, author
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, 1, NULL, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           name_lower = excluded.name_lower,
           bpm = excluded.bpm,
           musical_key = excluded.musical_key,
           genre = excluded.genre,
           tags_json = excluded.tags_json,
           notes = excluded.notes,
           color = excluded.color,
           is_favorite = excluded.is_favorite,
           duration_sec = excluded.duration_sec,
           created_at = excluded.created_at,
           updated_at = excluded.updated_at,
           deleted_at = NULL,
           audio_file_id = excluded.audio_file_id,
           cover_file_id = excluded.cover_file_id,
           author = CASE
             WHEN ? = 1 OR tracks.deleted_at IS NOT NULL THEN excluded.author
             ELSE tracks.author
           END,
           version = tracks.version + 1
         WHERE tracks.library_id = excluded.library_id
         RETURNING ${TRACK_COLUMNS}`,
      )
      .bind(
        input.id,
        input.libraryId,
        input.name,
        input.name.toLowerCase(),
        input.bpm,
        input.musicalKey,
        input.genre,
        JSON.stringify(input.tags),
        input.notes,
        input.color,
        input.isFavorite ? 1 : 0,
        input.durationSec,
        input.createdAt,
        input.updatedAt,
        input.audioFileId,
        input.coverFileId,
        input.author ?? null,
        input.author === undefined ? 0 : 1,
      )

    // Защита от гонки с чужим треком: правки вложений выполняются только для
    // строки этой библиотеки (EXISTS), поэтому id из другой библиотеки не трогаем.
    const clearAttachments = this.db
      .prepare(
        `DELETE FROM track_attachments
         WHERE track_id = ?
           AND EXISTS (SELECT 1 FROM tracks WHERE id = ? AND library_id = ?)`,
      )
      .bind(input.id, input.id, input.libraryId)
    const insertAttachments = input.attachmentFileIds.map((fileId, position) =>
      this.db
        .prepare(
          `INSERT INTO track_attachments (track_id, file_id, position)
           SELECT ?, ?, ?
           WHERE EXISTS (SELECT 1 FROM tracks WHERE id = ? AND library_id = ?)`,
        )
        .bind(input.id, fileId, position, input.id, input.libraryId),
    )

    const results = await this.db.batch([upsert, clearAttachments, ...insertAttachments])
    const row = results[0]?.results[0] as TrackRow | undefined
    return row ? toTrack(row) : null
  }

  async softDeleteTrack(libraryId: string, trackId: string, now: string): Promise<void> {
    await this.db
      .prepare(
        `UPDATE tracks SET deleted_at = ?
         WHERE id = ? AND library_id = ? AND deleted_at IS NULL`,
      )
      .bind(now, trackId, libraryId)
      .run()
  }

  async upsertFile(input: UpsertFileInput): Promise<FileRecord | null> {
    const result = await this.db
      .prepare(
        `INSERT INTO files (
           id, library_id, kind, r2_key, mime_type, size, original_name, sha256,
           created_at, deleted_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL)
         ON CONFLICT(id) DO UPDATE SET
           kind = excluded.kind,
           r2_key = excluded.r2_key,
           mime_type = excluded.mime_type,
           size = excluded.size,
           original_name = excluded.original_name,
           created_at = excluded.created_at,
           deleted_at = NULL
         WHERE files.library_id = excluded.library_id
         RETURNING ${FILE_COLUMNS}`,
      )
      .bind(
        input.id,
        input.libraryId,
        input.kind,
        input.r2Key,
        input.mimeType,
        input.size,
        input.originalName,
        input.now,
      )
      .all<FileRow>()
    const row = result.results[0]
    return row ? toFile(row) : null
  }

  async findFileById(fileId: string): Promise<FileRecord | null> {
    const row = await this.db
      .prepare(`SELECT ${FILE_COLUMNS} FROM files WHERE id = ?`)
      .bind(fileId)
      .first<FileRow>()
    return row ? toFile(row) : null
  }

  async createSession(input: CreateSessionInput): Promise<SessionRecord> {
    await this.db
      .prepare(
        `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, last_used_at, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.id,
        input.userId,
        input.tokenHash,
        input.createdAt,
        input.expiresAt,
        input.createdAt,
        input.userAgent,
      )
      .run()
    return {
      id: input.id,
      userId: input.userId,
      tokenHash: input.tokenHash,
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
      lastUsedAt: input.createdAt,
      userAgent: input.userAgent,
    }
  }

  async findSessionByHash(tokenHash: string): Promise<SessionRecord | null> {
    const row = await this.db
      .prepare(`SELECT ${SESSION_COLUMNS} FROM sessions WHERE token_hash = ?`)
      .bind(tokenHash)
      .first<SessionRow>()
    return row ? toSession(row) : null
  }

  async touchSession(input: TouchSessionInput): Promise<boolean> {
    const result = await this.db
      .prepare(
        `UPDATE sessions
         SET last_used_at = ?, expires_at = ?
         WHERE id = ? AND last_used_at < ?`,
      )
      .bind(input.now, input.nextExpiresAt, input.sessionId, input.staleBefore)
      .run()
    return (result.meta.changes ?? 0) > 0
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.db.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run()
  }

  async deleteUserSessions(userId: string): Promise<void> {
    await this.db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run()
  }

  async pruneUserSessions(userId: string, keep: number): Promise<void> {
    await this.db
      .prepare(
        `DELETE FROM sessions
         WHERE user_id = ?
           AND id NOT IN (
             SELECT id FROM sessions
             WHERE user_id = ?
             ORDER BY created_at DESC, id DESC
             LIMIT ?
           )`,
      )
      .bind(userId, userId, keep)
      .run()
  }

  async deleteExpiredSessions(now: string): Promise<number> {
    const result = await this.db
      .prepare('DELETE FROM sessions WHERE expires_at <= ?')
      .bind(now)
      .run()
    return result.meta.changes ?? 0
  }

  async hitRateLimit(key: string, windowStartSec: number, limit: number): Promise<boolean> {
    const row = await this.db
      .prepare(
        `INSERT INTO rate_limits (key, window_start, count)
         VALUES (?, ?, 1)
         ON CONFLICT(key) DO UPDATE SET
           count = CASE
             WHEN rate_limits.window_start < ? THEN 1
             ELSE rate_limits.count + 1
           END,
           window_start = CASE
             WHEN rate_limits.window_start < ? THEN ?
             ELSE rate_limits.window_start
           END
         RETURNING count`,
      )
      .bind(key, windowStartSec, windowStartSec, windowStartSec, windowStartSec)
      .first<{ count: number }>()
    return (row?.count ?? limit + 1) <= limit
  }

  async cleanupRateLimits(olderThanSec: number): Promise<number> {
    const result = await this.db
      .prepare('DELETE FROM rate_limits WHERE window_start < ?')
      .bind(olderThanSec)
      .run()
    return result.meta.changes ?? 0
  }
}
