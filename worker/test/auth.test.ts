import { describe, expect, it } from 'vitest'
import { ApiError } from '../src/lib/errors'
import { SESSION_TTL_MS } from '../src/lib/session'
import type { SessionRecord } from '../src/db/store'
import {
  MemoryStore,
  createHarness,
  loginRequest,
  meRequest,
  readJson,
} from './helpers'
import type { ErrorBody, Harness, LoginBody, MeBody } from './helpers'

const HOUR_MS = 60 * 60 * 1000

function sessionsOf(harness: Harness): SessionRecord[] {
  return [...harness.store.sessions.values()]
}

describe('POST /api/v1/auth/google', () => {
  it('без credential → 400 BAD_REQUEST', async () => {
    const harness = createHarness()
    const response = await harness.app.request(
      '/api/v1/auth/google',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      },
      harness.env,
    )

    expect(response.status).toBe(400)
    const body = await readJson<ErrorBody>(response)
    expect(body.error.code).toBe('BAD_REQUEST')
  })

  it('с некорректным JSON → 400 BAD_REQUEST', async () => {
    const harness = createHarness()
    const response = await harness.app.request(
      '/api/v1/auth/google',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{',
      },
      harness.env,
    )

    expect(response.status).toBe(400)
    const body = await readJson<ErrorBody>(response)
    expect(body.error.code).toBe('BAD_REQUEST')
  })

  it('неверный Google-токен → 401 UNAUTHORIZED', async () => {
    const harness = createHarness({
      verifyIdToken: async () => {
        throw new ApiError('UNAUTHORIZED', 'bad token')
      },
    })
    const response = await loginRequest(harness)

    expect(response.status).toBe(401)
    const body = await readJson<ErrorBody>(response)
    expect(body.error.code).toBe('UNAUTHORIZED')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('e-mail вне ALLOWED_EMAILS → 403 EMAIL_NOT_ALLOWED', async () => {
    const harness = createHarness({
      identity: { sub: 'google-sub-stranger', email: 'stranger@example.com' },
    })
    const response = await loginRequest(harness)

    expect(response.status).toBe(403)
    const body = await readJson<ErrorBody>(response)
    expect(body.error.code).toBe('EMAIL_NOT_ALLOWED')
    expect(harness.store.users.size).toBe(0)
  })

  it('пустой ALLOWED_EMAILS запрещает вход (fail closed)', async () => {
    const harness = createHarness({ env: { ALLOWED_EMAILS: '' } })
    const response = await loginRequest(harness)

    expect(response.status).toBe(403)
    const body = await readJson<ErrorBody>(response)
    expect(body.error.code).toBe('EMAIL_NOT_ALLOWED')
  })

  it('успешный вход → token, expiresAt, user, libraries', async () => {
    const harness = createHarness()
    const response = await loginRequest(harness)

    expect(response.status).toBe(200)
    const body = await readJson<LoginBody>(response)

    expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(Date.parse(body.expiresAt)).toBe(Date.parse(harness.nowIso()) + SESSION_TTL_MS)
    expect(body.user.email).toBe('Owner@Example.com')
    expect(body.user.name).toBe('Owner')
    expect(body.libraries).toHaveLength(1)
    expect(body.libraries[0]?.id).toBe(`lib_${body.user.id}`)
    expect(body.libraries[0]?.name).toBe('Моя библиотека')
    expect(body.libraries[0]?.role).toBe('owner')

    const sessions = sessionsOf(harness)
    expect(sessions).toHaveLength(1)
    expect(sessions[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(sessions[0]?.tokenHash).not.toBe(body.token)
  })

  it('повторный вход не создаёт дублей пользователя и библиотеки', async () => {
    const harness = createHarness()
    const first = await readJson<LoginBody>(await loginRequest(harness))
    const second = await readJson<LoginBody>(await loginRequest(harness))

    expect(second.user.id).toBe(first.user.id)
    expect(second.libraries[0]?.id).toBe(first.libraries[0]?.id)
    expect(harness.store.users.size).toBe(1)
    expect(harness.store.libraries.size).toBe(1)
    expect(harness.store.sessions.size).toBe(2)
  })

  it('без name/picture в токене поля пользователя null', async () => {
    const harness = createHarness({ identity: { sub: 'google-sub-2', email: 'second@example.com' } })
    const body = await readJson<LoginBody>(await loginRequest(harness))

    expect(body.user.name).toBeNull()
    expect(body.user.picture).toBeNull()
  })
})

describe('GET /api/v1/auth/me', () => {
  it('с Bearer возвращает пользователя и библиотеки', async () => {
    const harness = createHarness()
    const login = await readJson<LoginBody>(await loginRequest(harness))
    const response = await meRequest(harness, login.token)

    expect(response.status).toBe(200)
    const body = await readJson<MeBody>(response)
    expect(body.user).toEqual(login.user)
    expect(body.libraries).toEqual(login.libraries)
  })

  it('без токена → 401 UNAUTHORIZED', async () => {
    const harness = createHarness()
    const response = await harness.app.request('/api/v1/auth/me', undefined, harness.env)

    expect(response.status).toBe(401)
    const body = await readJson<ErrorBody>(response)
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('с неизвестным токеном → 401 UNAUTHORIZED', async () => {
    const harness = createHarness()
    const response = await meRequest(harness, 'A'.repeat(43))

    expect(response.status).toBe(401)
    const body = await readJson<ErrorBody>(response)
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('истёкшая сессия → 401 и строка сессии удалена', async () => {
    const harness = createHarness()
    const login = await readJson<LoginBody>(await loginRequest(harness))

    harness.advanceMs(SESSION_TTL_MS + 1000)
    const response = await meRequest(harness, login.token)

    expect(response.status).toBe(401)
    expect(harness.store.sessions.size).toBe(0)
  })

  it('expires_at продлевается не чаще раза в сутки', async () => {
    const harness = createHarness()
    const login = await readJson<LoginBody>(await loginRequest(harness))
    const initialExpiry = Date.parse(login.expiresAt)

    // В пределах суток продления нет.
    harness.advanceMs(HOUR_MS)
    expect((await meRequest(harness, login.token)).status).toBe(200)
    const afterOneHour = sessionsOf(harness)[0]
    expect(afterOneHour?.expiresAt).toBe(login.expiresAt)

    // Через 25 часов продление происходит.
    harness.advanceMs(24 * HOUR_MS)
    expect((await meRequest(harness, login.token)).status).toBe(200)
    const afterOneDay = sessionsOf(harness)[0]
    expect(Date.parse(afterOneDay?.expiresAt ?? '')).toBe(
      Date.parse(harness.nowIso()) + SESSION_TTL_MS,
    )
    expect(Date.parse(afterOneDay?.expiresAt ?? '')).toBeGreaterThan(initialExpiry)
    const extendedExpiry = afterOneDay?.expiresAt

    // Ещё через час — без повторного продления.
    harness.advanceMs(HOUR_MS)
    expect((await meRequest(harness, login.token)).status).toBe(200)
    const afterTwoDays = sessionsOf(harness)[0]
    expect(afterTwoDays?.expiresAt).toBe(extendedExpiry)
  })

  it('возвращает expiresAt — валидный ISO не раньше прежнего срока сессии', async () => {
    const harness = createHarness()
    const login = await readJson<LoginBody>(await loginRequest(harness))
    const body = await readJson<MeBody>(await meRequest(harness, login.token))

    expect(Number.isFinite(Date.parse(body.expiresAt))).toBe(true)
    expect(body.expiresAt).toBe(new Date(body.expiresAt).toISOString())
    expect(Date.parse(body.expiresAt)).toBeGreaterThanOrEqual(Date.parse(login.expiresAt))
  })

  it('отдаёт продлённый срок после продления и прежний — без него', async () => {
    const harness = createHarness()
    const login = await readJson<LoginBody>(await loginRequest(harness))

    // В пределах суток сессия не продлевается — срок прежний (touchSession вернул false).
    harness.advanceMs(HOUR_MS)
    const notExtended = await readJson<MeBody>(await meRequest(harness, login.token))
    expect(notExtended.expiresAt).toBe(login.expiresAt)
    expect(notExtended.expiresAt).toBe(sessionsOf(harness)[0]?.expiresAt)

    // Через 25 часов сессия продлевается — отдаём новый срок (now + SESSION_TTL_MS).
    harness.advanceMs(24 * HOUR_MS)
    const extended = await readJson<MeBody>(await meRequest(harness, login.token))
    const expected = new Date(Date.parse(harness.nowIso()) + SESSION_TTL_MS).toISOString()
    expect(extended.expiresAt).toBe(expected)
    expect(extended.expiresAt).toBe(sessionsOf(harness)[0]?.expiresAt)
    expect(Date.parse(extended.expiresAt)).toBeGreaterThan(Date.parse(login.expiresAt))
  })

  it('при параллельном продлении отдаёт срок, записанный другим запросом', async () => {
    const harness = createHarness()
    const login = await readJson<LoginBody>(await loginRequest(harness))
    // Через сутки строка несвежая, поэтому middleware попытается продлить её.
    harness.advanceMs(25 * HOUR_MS)

    const sessionId = sessionsOf(harness)[0]?.id
    const concurrentExpiry = new Date(Date.parse(harness.nowIso()) + SESSION_TTL_MS).toISOString()
    // Параллельный запрос продлевает сессию между чтением и UPDATE — наш
    // touchSession видит уже свежую строку и ничего не меняет.
    harness.store.touchSession = async () => {
      const current = sessionId ? harness.store.sessions.get(sessionId) : undefined
      if (current) {
        current.lastUsedAt = harness.nowIso()
        current.expiresAt = concurrentExpiry
      }
      return false
    }

    const response = await meRequest(harness, login.token)

    expect(response.status).toBe(200)
    const body = await readJson<MeBody>(response)
    expect(body.expiresAt).toBe(concurrentExpiry)
    expect(body.expiresAt).not.toBe(login.expiresAt)
  })

  it('сбой продления не ломает ответ и отдаёт прежний срок', async () => {
    const harness = createHarness()
    const login = await readJson<LoginBody>(await loginRequest(harness))
    harness.store.touchSession = async () => {
      throw new Error('D1 down')
    }

    const response = await meRequest(harness, login.token)

    expect(response.status).toBe(200)
    const body = await readJson<MeBody>(response)
    expect(body.expiresAt).toBe(login.expiresAt)
  })
})

describe('POST /api/v1/auth/logout', () => {
  it('удаляет текущую сессию и отвечает 204', async () => {
    const harness = createHarness()
    const login = await readJson<LoginBody>(await loginRequest(harness))

    const logout = await harness.app.request(
      '/api/v1/auth/logout',
      { method: 'POST', headers: { Authorization: `Bearer ${login.token}` } },
      harness.env,
    )
    expect(logout.status).toBe(204)
    expect(harness.store.sessions.size).toBe(0)

    const me = await meRequest(harness, login.token)
    expect(me.status).toBe(401)
  })

  it('без токена → 401', async () => {
    const harness = createHarness()
    const response = await harness.app.request(
      '/api/v1/auth/logout',
      { method: 'POST' },
      harness.env,
    )
    expect(response.status).toBe(401)
  })
})

describe('POST /api/v1/auth/logout-all', () => {
  it('отзывает все сессии пользователя', async () => {
    const harness = createHarness()
    const first = await readJson<LoginBody>(await loginRequest(harness))
    const second = await readJson<LoginBody>(await loginRequest(harness))
    expect(harness.store.sessions.size).toBe(2)

    const response = await harness.app.request(
      '/api/v1/auth/logout-all',
      { method: 'POST', headers: { Authorization: `Bearer ${first.token}` } },
      harness.env,
    )

    expect(response.status).toBe(204)
    expect(harness.store.sessions.size).toBe(0)
    expect((await meRequest(harness, first.token)).status).toBe(401)
    expect((await meRequest(harness, second.token)).status).toBe(401)
  })
})

describe('защита /auth/google', () => {
  it('без application/json в Content-Type → 400', async () => {
    const harness = createHarness()
    const response = await harness.app.request(
      '/api/v1/auth/google',
      {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ credential: 'x' }),
      },
      harness.env,
    )

    expect(response.status).toBe(400)
    expect((await readJson<ErrorBody>(response)).error.code).toBe('BAD_REQUEST')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('application/jsonp не принимается как JSON → 400', async () => {
    const harness = createHarness()
    const response = await harness.app.request(
      '/api/v1/auth/google',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/jsonp' },
        body: JSON.stringify({ credential: 'x' }),
      },
      harness.env,
    )

    expect(response.status).toBe(400)
    expect((await readJson<ErrorBody>(response)).error.code).toBe('BAD_REQUEST')
  })

  it('application/json с charset принимается', async () => {
    const harness = createHarness()
    const response = await harness.app.request(
      '/api/v1/auth/google',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ credential: 'stub' }),
      },
      harness.env,
    )

    expect(response.status).toBe(200)
  })

  it('credential длиннее 8192 символов → 400', async () => {
    const harness = createHarness()
    const response = await harness.app.request(
      '/api/v1/auth/google',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: 'a'.repeat(8193) }),
      },
      harness.env,
    )

    expect(response.status).toBe(400)
    expect((await readJson<ErrorBody>(response)).error.code).toBe('BAD_REQUEST')
  })

  it('тело больше 16 КиБ → 413 PAYLOAD_TOO_LARGE', async () => {
    const harness = createHarness()
    const body = JSON.stringify({ credential: 'a'.repeat(20_000) })
    const response = await harness.app.request(
      '/api/v1/auth/google',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(body.length),
        },
        body,
      },
      harness.env,
    )

    expect(response.status).toBe(413)
    expect((await readJson<ErrorBody>(response)).error.code).toBe('PAYLOAD_TOO_LARGE')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('тело больше 16 КиБ без Content-Length → 413', async () => {
    const harness = createHarness()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(JSON.stringify({ credential: 'a'.repeat(20_000) })),
        )
        controller.close()
      },
    })
    const response = await harness.app.request(
      '/api/v1/auth/google',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        duplex: 'half',
      } as RequestInit,
      harness.env,
    )

    expect(response.status).toBe(413)
    expect((await readJson<ErrorBody>(response)).error.code).toBe('PAYLOAD_TOO_LARGE')
  })

  it('больше 10 попыток входа за минуту с одного IP → 429', async () => {
    const harness = createHarness()
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await loginRequest(harness)).status).toBe(200)
    }

    const blocked = await loginRequest(harness)
    expect(blocked.status).toBe(429)
    expect((await readJson<ErrorBody>(blocked)).error.code).toBe('RATE_LIMITED')
    expect(blocked.headers.get('cache-control')).toBe('no-store')

    // Новое окно — снова можно.
    harness.advanceMs(60_000)
    expect((await loginRequest(harness)).status).toBe(200)
  })

  it('лимит считается по IP из CF-Connecting-IP', async () => {
    const harness = createHarness()
    const attempt = (ip: string) =>
      harness.app.request(
        '/api/v1/auth/google',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
          body: JSON.stringify({ credential: 'stub' }),
        },
        harness.env,
      )

    for (let index = 0; index < 10; index += 1) {
      expect((await attempt('203.0.113.7')).status).toBe(200)
    }
    expect((await attempt('203.0.113.7')).status).toBe(429)
    // Другой IP не затронут.
    expect((await attempt('203.0.113.8')).status).toBe(200)
  })

  it('сбой счётчика rate limit → 500, а не пропуск входа', async () => {
    const store = new MemoryStore()
    store.hitRateLimit = async () => {
      throw new Error('D1 down')
    }
    const harness = createHarness({ store })

    const response = await loginRequest(harness)

    expect(response.status).toBe(500)
    expect((await readJson<ErrorBody>(response)).error.code).toBe('INTERNAL')
    expect(harness.store.users.size).toBe(0)
  })

  it('User-Agent в сессии обрезается до 512 символов', async () => {
    const harness = createHarness()
    const response = await harness.app.request(
      '/api/v1/auth/google',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'U'.repeat(5000),
        },
        body: JSON.stringify({ credential: 'stub' }),
      },
      harness.env,
    )

    expect(response.status).toBe(200)
    expect(sessionsOf(harness)[0]?.userAgent).toHaveLength(512)
  })

  it('ответы авторизации не кэшируются', async () => {
    const harness = createHarness()
    const login = await loginRequest(harness)
    expect(login.headers.get('cache-control')).toBe('no-store')

    const token = (await readJson<LoginBody>(login)).token
    const me = await meRequest(harness, token)
    expect(me.headers.get('cache-control')).toBe('no-store')
  })

  it('на пользователя хранится не больше 20 сессий', async () => {
    const harness = createHarness()
    const tokens: string[] = []
    for (let index = 0; index < 21; index += 1) {
      tokens.push((await readJson<LoginBody>(await loginRequest(harness))).token)
      harness.advanceMs(61_000)
    }

    expect(harness.store.sessions.size).toBe(20)
    // Самая старая сессия вытеснена, последняя работает.
    expect((await meRequest(harness, tokens[0] ?? '')).status).toBe(401)
    expect((await meRequest(harness, tokens[20] ?? '')).status).toBe(200)
  })

  it('счётчики старых окон rate limit очищаются при входе', async () => {
    const harness = createHarness()
    await harness.store.hitRateLimit('login:old-ip', 1000, 10)
    await harness.store.hitRateLimit('login:recent-ip', Math.floor(Date.parse(harness.nowIso()) / 1000), 10)

    expect((await loginRequest(harness)).status).toBe(200)

    expect(harness.store.rateLimits.has('login:old-ip')).toBe(false)
    expect(harness.store.rateLimits.has('login:recent-ip')).toBe(true)
  })
})
