import { createId } from '../lib/ids'
import { DEFAULT_LIBRARY_NAME } from './store'
import type {
  CreateSessionInput,
  LibraryRecord,
  LibraryWithRole,
  SessionRecord,
  Store,
  TouchSessionInput,
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

const USER_COLUMNS = 'id, google_sub, email, name, picture, created_at, last_seen_at'
const LIBRARY_COLUMNS = 'id, owner_user_id, name, created_at, updated_at, version'
const SESSION_COLUMNS = 'id, user_id, token_hash, created_at, expires_at, last_used_at, user_agent'

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
