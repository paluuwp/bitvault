import { Hono } from 'hono'
import type { Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { AppEnv, Env } from '../env'
import type { Store, LibraryWithRole, UserRecord } from '../db/store'
import { requireAuth } from '../middleware/auth'
import { isEmailAllowed } from '../lib/allowlist'
import { ApiError, errorEnvelope } from '../lib/errors'
import type { VerifyIdToken } from '../lib/google'
import { createId } from '../lib/ids'
import { SESSION_TTL_MS, generateSessionToken, hashSessionToken } from '../lib/session'

const MAX_CREDENTIAL_LENGTH = 8192
/** Тело /auth/google: credential 8 КиБ + запас на JSON. */
const MAX_BODY_BYTES = 16 * 1024
const MAX_USER_AGENT_LENGTH = 512
const MAX_SESSIONS_PER_USER = 20
const LOGIN_RATE_LIMIT = 10
const LOGIN_RATE_WINDOW_SEC = 60
/** Счётчики старых окон храним час — этого хватает для разбора инцидентов. */
const RATE_LIMIT_RETENTION_SEC = 3600

export interface AuthRoutesDeps {
  storeFactory: (env: Env) => Store
  verifyIdToken: VerifyIdToken
  now: () => Date
}

interface PublicUser {
  id: string
  email: string
  name: string | null
  picture: string | null
}

interface PublicLibrary {
  id: string
  name: string
  role: string
}

function toPublicUser(user: UserRecord): PublicUser {
  return { id: user.id, email: user.email, name: user.name, picture: user.picture }
}

function toPublicLibrary(library: LibraryWithRole): PublicLibrary {
  return { id: library.id, name: library.name, role: library.role }
}

/** Валидация тела POST /auth/google на сервере. */
async function readCredential(c: Context<AppEnv>): Promise<string> {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    throw new ApiError('BAD_REQUEST', 'Тело запроса должно быть корректным JSON.')
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ApiError('BAD_REQUEST', 'Не передан credential.')
  }
  const credential = (body as Record<string, unknown>).credential
  if (typeof credential !== 'string' || credential.trim().length === 0) {
    throw new ApiError('BAD_REQUEST', 'Не передан credential.')
  }
  const value = credential.trim()
  if (value.length > MAX_CREDENTIAL_LENGTH) {
    throw new ApiError('BAD_REQUEST', 'Credential слишком длинный.')
  }
  return value
}

export function authRoutes(deps: AuthRoutesDeps): Hono<AppEnv> {
  const router = new Hono<AppEnv>()
  const auth = requireAuth({ storeFactory: deps.storeFactory, now: deps.now })

  // Ответы авторизации содержат сессионный токен — кэшировать нельзя.
  router.use('*', async (c, next) => {
    await next()
    c.res.headers.set('Cache-Control', 'no-store')
  })

  router.post(
    '/google',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => c.json(errorEnvelope('PAYLOAD_TOO_LARGE'), 413),
    }),
    async (c) => {
      const mediaType = (c.req.header('Content-Type') ?? '')
        .split(';')[0]
        ?.trim()
        .toLowerCase()
      if (mediaType !== 'application/json') {
        throw new ApiError('BAD_REQUEST', 'Ожидается Content-Type: application/json.')
      }

      const store = deps.storeFactory(c.env)
      const nowDate = deps.now()
      const nowIso = nowDate.toISOString()
      const nowSec = Math.floor(nowDate.getTime() / 1000)
      const windowStartSec = nowSec - (nowSec % LOGIN_RATE_WINDOW_SEC)
      const clientIp = c.req.header('CF-Connecting-IP')?.trim() || 'unknown'
      const allowed = await store.hitRateLimit(
        `login:${clientIp}`,
        windowStartSec,
        LOGIN_RATE_LIMIT,
      )
      if (!allowed) {
        throw new ApiError('RATE_LIMITED', 'Слишком много попыток входа. Повторите позже.')
      }

      try {
        // Убираем счётчики старых окон, чтобы таблица не росла бесконечно.
        await store.cleanupRateLimits(nowSec - RATE_LIMIT_RETENTION_SEC)
      } catch {
        // Уборка счётчиков не должна ломать вход.
      }

      const credential = await readCredential(c)
      const identity = await deps.verifyIdToken(credential, c.env)

      if (!isEmailAllowed(identity.email, c.env.ALLOWED_EMAILS)) {
        throw new ApiError('EMAIL_NOT_ALLOWED', 'Этот e-mail не входит в список разрешённых.')
      }

      const user = await store.upsertUser({
        googleSub: identity.sub,
        email: identity.email,
        name: identity.name ?? null,
        picture: identity.picture ?? null,
        now: nowIso,
      })
      await store.createPersonalLibrary(user.id, nowIso)
      const libraries = await store.listLibrariesForUser(user.id)

      const token = generateSessionToken()
      const tokenHash = await hashSessionToken(token)
      const expiresAt = new Date(nowDate.getTime() + SESSION_TTL_MS).toISOString()
      await store.createSession({
        id: createId('sess'),
        userId: user.id,
        tokenHash,
        createdAt: nowIso,
        expiresAt,
        userAgent: c.req.header('User-Agent')?.slice(0, MAX_USER_AGENT_LENGTH) ?? null,
      })

      try {
        await store.pruneUserSessions(user.id, MAX_SESSIONS_PER_USER)
      } catch {
        // Ограничение старых сессий не должно ломать вход.
      }

      try {
        // Оппортунистическая очистка истёкших сессий при входе.
        await store.deleteExpiredSessions(nowIso)
      } catch {
        // Очистка не должна ломать вход.
      }

      return c.json({
        token,
        expiresAt,
        user: toPublicUser(user),
        libraries: libraries.map(toPublicLibrary),
      })
    },
  )

  router.get('/me', auth, async (c) => {
    const store = deps.storeFactory(c.env)
    const userId = c.get('userId')
    const user = await store.findUserById(userId)
    if (!user) {
      await store.deleteSession(c.get('sessionId'))
      throw new ApiError('UNAUTHORIZED', 'Пользователь сессии не найден.')
    }
    const libraries = await store.listLibrariesForUser(userId)
    return c.json({
      user: toPublicUser(user),
      libraries: libraries.map(toPublicLibrary),
      expiresAt: c.get('sessionExpiresAt'),
    })
  })

  router.post('/logout', auth, async (c) => {
    const store = deps.storeFactory(c.env)
    await store.deleteSession(c.get('sessionId'))
    return c.body(null, 204)
  })

  router.post('/logout-all', auth, async (c) => {
    const store = deps.storeFactory(c.env)
    await store.deleteUserSessions(c.get('userId'))
    return c.body(null, 204)
  })

  return router
}
