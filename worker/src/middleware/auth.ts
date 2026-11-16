import { createMiddleware } from 'hono/factory'
import type { AppEnv, Env } from '../env'
import type { Store } from '../db/store'
import { ApiError } from '../lib/errors'
import {
  SESSION_TOUCH_INTERVAL_MS,
  SESSION_TTL_MS,
  hashSessionToken,
  parseBearerToken,
} from '../lib/session'

export interface AuthDeps {
  storeFactory: (env: Env) => Store
  now: () => Date
}

/**
 * Bearer → SHA-256 → сессия в D1.
 * Истёкшую сессию удаляет и отвечает 401. expires_at продлевает не чаще раза в сутки.
 */
export function requireAuth(deps: AuthDeps) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const token = parseBearerToken(c.req.header('Authorization'))
    if (!token) {
      throw new ApiError('UNAUTHORIZED', 'Требуется заголовок Authorization: Bearer <token>.')
    }

    const store = deps.storeFactory(c.env)
    const tokenHash = await hashSessionToken(token)
    const session = await store.findSessionByHash(tokenHash)
    const nowDate = deps.now()
    const nowIso = nowDate.toISOString()

    if (!session) {
      throw new ApiError('UNAUTHORIZED', 'Сессия не найдена или отозвана.')
    }
    const expiresAtMs = Date.parse(session.expiresAt)
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowDate.getTime()) {
      try {
        await store.deleteSession(session.id)
      } catch {
        // Сбой очистки не должен превращать 401 в 500.
      }
      throw new ApiError('UNAUTHORIZED', 'Сессия истекла.')
    }

    const staleBefore = new Date(nowDate.getTime() - SESSION_TOUCH_INTERVAL_MS).toISOString()
    const nextExpiresAt = new Date(nowDate.getTime() + SESSION_TTL_MS).toISOString()
    let sessionExpiresAt = session.expiresAt
    try {
      const extended = await store.touchSession({
        sessionId: session.id,
        now: nowIso,
        nextExpiresAt,
        staleBefore,
      })
      // Клиенту отдаём фактический срок: продлённый или прежний.
      if (extended) {
        sessionExpiresAt = nextExpiresAt
      } else if (session.lastUsedAt < staleBefore) {
        // Строка была несвежей на момент чтения, но обновление не прошло —
        // значит, её успел продлить параллельный запрос. Перечитываем, чтобы
        // не вернуть клиенту устаревший срок (даты в ISO сравнимы как строки).
        const current = await store.findSessionByHash(tokenHash)
        if (current) sessionExpiresAt = current.expiresAt
      }
    } catch {
      // Продление сессии не критично для текущего запроса — отдаём прежний срок.
    }

    c.set('userId', session.userId)
    c.set('sessionId', session.id)
    c.set('sessionExpiresAt', sessionExpiresAt)
    await next()
  })
}
