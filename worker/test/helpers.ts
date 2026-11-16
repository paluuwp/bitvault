import { createApp } from '../src/index'
import type { Env } from '../src/env'
import type {
  CreateSessionInput,
  LibraryRecord,
  LibraryWithRole,
  SessionRecord,
  Store,
  TouchSessionInput,
  UpsertUserInput,
  UserRecord,
} from '../src/db/store'
import { DEFAULT_LIBRARY_NAME } from '../src/db/store'
import type { Identity, VerifyIdToken } from '../src/lib/google'

interface Membership {
  libraryId: string
  userId: string
  role: string
  createdAt: string
}

/** In-memory Store с той же семантикой, что D1Store, для тестов без сети. */
export class MemoryStore implements Store {
  readonly users = new Map<string, UserRecord>()
  readonly sessions = new Map<string, SessionRecord>()
  readonly libraries = new Map<string, LibraryRecord>()
  readonly memberships: Membership[] = []
  readonly rateLimits = new Map<string, { windowStart: number; count: number }>()
  private userSeq = 0

  async findUserByGoogleSub(googleSub: string): Promise<UserRecord | null> {
    for (const user of this.users.values()) {
      if (user.googleSub === googleSub) return { ...user }
    }
    return null
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    const user = this.users.get(id)
    return user ? { ...user } : null
  }

  async upsertUser(input: UpsertUserInput): Promise<UserRecord> {
    const existing = await this.findUserByGoogleSub(input.googleSub)
    if (existing) {
      const updated: UserRecord = {
        ...existing,
        email: input.email,
        name: input.name,
        picture: input.picture,
        lastSeenAt: input.now,
      }
      this.users.set(updated.id, updated)
      return { ...updated }
    }

    this.userSeq += 1
    const created: UserRecord = {
      id: `usr_${this.userSeq}`,
      googleSub: input.googleSub,
      email: input.email,
      name: input.name,
      picture: input.picture,
      createdAt: input.now,
      lastSeenAt: input.now,
    }
    this.users.set(created.id, created)
    return { ...created }
  }

  async createPersonalLibrary(
    userId: string,
    now: string,
    name: string = DEFAULT_LIBRARY_NAME,
  ): Promise<LibraryRecord> {
    const id = `lib_${userId}`
    const existing = this.libraries.get(id)
    if (existing) return { ...existing }

    const library: LibraryRecord = {
      id,
      ownerUserId: userId,
      name,
      createdAt: now,
      updatedAt: now,
      version: 1,
    }
    this.libraries.set(id, library)
    this.memberships.push({ libraryId: id, userId, role: 'owner', createdAt: now })
    return { ...library }
  }

  async listLibrariesForUser(userId: string): Promise<LibraryWithRole[]> {
    const result: LibraryWithRole[] = []
    for (const membership of this.memberships) {
      if (membership.userId !== userId) continue
      const library = this.libraries.get(membership.libraryId)
      if (!library) continue
      result.push({ ...library, role: membership.role })
    }
    result.sort((a, b) => {
      if (a.createdAt === b.createdAt) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
      return a.createdAt < b.createdAt ? -1 : 1
    })
    return result
  }

  async createSession(input: CreateSessionInput): Promise<SessionRecord> {
    const session: SessionRecord = {
      id: input.id,
      userId: input.userId,
      tokenHash: input.tokenHash,
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
      lastUsedAt: input.createdAt,
      userAgent: input.userAgent,
    }
    this.sessions.set(session.id, session)
    return { ...session }
  }

  async findSessionByHash(tokenHash: string): Promise<SessionRecord | null> {
    for (const session of this.sessions.values()) {
      if (session.tokenHash === tokenHash) return { ...session }
    }
    return null
  }

  async touchSession(input: TouchSessionInput): Promise<boolean> {
    const session = this.sessions.get(input.sessionId)
    if (!session) return false
    if (Date.parse(session.lastUsedAt) >= Date.parse(input.staleBefore)) return false
    session.lastUsedAt = input.now
    session.expiresAt = input.nextExpiresAt
    return true
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId)
  }

  async deleteUserSessions(userId: string): Promise<void> {
    for (const [id, session] of this.sessions) {
      if (session.userId === userId) this.sessions.delete(id)
    }
  }

  async pruneUserSessions(userId: string, keep: number): Promise<void> {
    const userSessions = [...this.sessions.values()]
      .filter((session) => session.userId === userId)
      .sort(
        (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
      )
    for (const session of userSessions.slice(keep)) {
      this.sessions.delete(session.id)
    }
  }

  async hitRateLimit(key: string, windowStartSec: number, limit: number): Promise<boolean> {
    const existing = this.rateLimits.get(key)
    if (!existing || existing.windowStart < windowStartSec) {
      this.rateLimits.set(key, { windowStart: windowStartSec, count: 1 })
      return 1 <= limit
    }
    existing.count += 1
    return existing.count <= limit
  }

  async cleanupRateLimits(olderThanSec: number): Promise<number> {
    let removed = 0
    for (const [key, entry] of this.rateLimits) {
      if (entry.windowStart < olderThanSec) {
        this.rateLimits.delete(key)
        removed += 1
      }
    }
    return removed
  }

  async deleteExpiredSessions(now: string): Promise<number> {
    const nowMs = Date.parse(now)
    let removed = 0
    for (const [id, session] of this.sessions) {
      if (Date.parse(session.expiresAt) <= nowMs) {
        this.sessions.delete(id)
        removed += 1
      }
    }
    return removed
  }
}

export const DEFAULT_IDENTITY: Identity = {
  sub: 'google-sub-owner',
  email: 'Owner@Example.com',
  name: 'Owner',
  picture: 'https://example.com/avatar.png',
}

export function createTestEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: undefined as unknown as D1Database,
    BUCKET: undefined as unknown as R2Bucket,
    PUBLIC_ORIGINS: 'https://paluuwp.github.io,http://localhost:5173',
    GOOGLE_CLIENT_ID: 'test-client-id',
    ALLOWED_EMAILS: ' owner@example.com , second@example.com ',
    MEDIA_TOKEN_SECRET: 'test-only-media-secret',
    ...overrides,
  }
}

export interface HarnessOptions {
  identity?: Identity
  verifyIdToken?: VerifyIdToken
  env?: Partial<Env>
  startIso?: string
  store?: MemoryStore
}

export interface Harness {
  app: ReturnType<typeof createApp>
  store: MemoryStore
  env: Env
  nowIso: () => string
  advanceMs: (ms: number) => void
  setTime: (iso: string) => void
}

export function createHarness(options: HarnessOptions = {}): Harness {
  const store = options.store ?? new MemoryStore()
  const identity = options.identity ?? DEFAULT_IDENTITY
  const env = createTestEnv(options.env)
  let nowMs = Date.parse(options.startIso ?? '2026-11-16T10:00:00.000Z')
  const now = () => new Date(nowMs)

  const app = createApp({
    storeFactory: () => store,
    verifyIdToken: options.verifyIdToken ?? (async () => identity),
    now,
  })

  return {
    app,
    store,
    env,
    nowIso: () => new Date(nowMs).toISOString(),
    advanceMs: (ms: number) => {
      nowMs += ms
    },
    setTime: (iso: string) => {
      nowMs = Date.parse(iso)
    },
  }
}

export interface PublicUserBody {
  id: string
  email: string
  name: string | null
  picture: string | null
}

export interface PublicLibraryBody {
  id: string
  name: string
  role: string
}

export interface LoginBody {
  token: string
  expiresAt: string
  user: PublicUserBody
  libraries: PublicLibraryBody[]
}

export interface MeBody {
  user: PublicUserBody
  libraries: PublicLibraryBody[]
  expiresAt: string
}

export interface ErrorBody {
  error: {
    code: string
    message: string
  }
}

export async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

export async function loginRequest(
  harness: Harness,
  credential = 'stub-google-credential',
): Promise<Response> {
  return harness.app.request(
    '/api/v1/auth/google',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
    },
    harness.env,
  )
}

export async function meRequest(harness: Harness, token: string): Promise<Response> {
  return harness.app.request(
    '/api/v1/auth/me',
    { headers: { Authorization: `Bearer ${token}` } },
    harness.env,
  )
}
