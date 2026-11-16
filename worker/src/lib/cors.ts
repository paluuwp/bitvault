import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../env'

export const DEFAULT_PUBLIC_ORIGINS = ['https://paluuwp.github.io', 'http://localhost:5173']
export const ALLOWED_REQUEST_HEADERS = 'Authorization, Content-Type'
export const ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS'

const PREFLIGHT_MAX_AGE = '86400'

/**
 * Разбирает PUBLIC_ORIGINS через запятую. undefined — значения по умолчанию
 * для локальной разработки; явно пустое значение — пустой список (CORS закрыт).
 */
export function parseOrigins(raw: string | undefined): string[] {
  if (raw === undefined) return [...DEFAULT_PUBLIC_ORIGINS]
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
}

/** Точное совпадение origin с белым списком (без wildcard и подстрочных совпадений). */
export function matchOrigin(
  origin: string | null | undefined,
  allowed: readonly string[],
): string | null {
  if (!origin) return null
  return allowed.includes(origin) ? origin : null
}

/** Добавляет токен в Vary, не дублируя его. */
export function appendVary(headers: Headers, token: string): void {
  const current = headers.get('Vary')
  if (!current) {
    headers.set('Vary', token)
    return
  }
  const tokens = current.split(',').map((value) => value.trim().toLowerCase())
  if (!tokens.includes(token.toLowerCase())) {
    headers.set('Vary', `${current}, ${token}`)
  }
}

/**
 * CORS по контракту: только точные origin из PUBLIC_ORIGINS, preflight — 204.
 * Для чужого origin ответ остаётся без Access-Control-Allow-Origin.
 */
export function corsMiddleware(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const origin = c.req.header('Origin') ?? null
    const allowedOrigin = matchOrigin(origin, parseOrigins(c.env.PUBLIC_ORIGINS))

    if (c.req.method === 'OPTIONS') {
      const headers = new Headers()
      appendVary(headers, 'Origin')
      if (allowedOrigin) {
        headers.set('Access-Control-Allow-Origin', allowedOrigin)
        headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS)
        headers.set('Access-Control-Allow-Headers', ALLOWED_REQUEST_HEADERS)
        headers.set('Access-Control-Max-Age', PREFLIGHT_MAX_AGE)
      }
      return new Response(null, { status: 204, headers })
    }

    await next()

    appendVary(c.res.headers, 'Origin')
    if (allowedOrigin) {
      c.res.headers.set('Access-Control-Allow-Origin', allowedOrigin)
    }
  }
}
