import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRemoteApi } from '../api/client'
import { RemoteApiError } from '../api/errors'
import type { ApiErrorCode, LoginResponse, MeResponse } from '../api/types'

const BASE_URL = 'https://bitvault-api.bitvault-api.workers.dev/api/v1'

const LOGIN_PAYLOAD: LoginResponse = {
  token: 'session-token',
  expiresAt: '2026-12-16T10:00:00.000Z',
  user: {
    id: 'user-1',
    email: 'user@example.com',
    name: 'Иван',
    picture: null,
  },
  libraries: [{ id: 'library-1', name: 'Моя библиотека', role: 'owner' }],
}

const ME_PAYLOAD: MeResponse = {
  user: {
    id: 'user-1',
    email: 'user@example.com',
    name: null,
    picture: 'https://example.com/avatar.png',
  },
  libraries: [{ id: 'library-1', name: 'Моя библиотека', role: 'owner' }],
  expiresAt: '2026-12-31T10:00:00.000Z',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function textResponse(body: string, status: number): Response {
  return new Response(body, { status })
}

async function captureError(action: () => Promise<unknown>): Promise<RemoteApiError> {
  try {
    await action()
  } catch (error) {
    if (error instanceof RemoteApiError) return error
    throw error
  }
  throw new Error('Ожидалась ошибка RemoteApiError.')
}

afterEach(() => {
  vi.useRealTimers()
})

describe('createRemoteApi: успешные запросы', () => {
  it('входит через Google и отправляет корректный запрос', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(LOGIN_PAYLOAD))
    const api = createRemoteApi({ baseUrl: BASE_URL, fetchImpl })
    const credential = 'google-credential-value'

    const result = await api.loginWithGoogle(credential)

    expect(result).toEqual(LOGIN_PAYLOAD)
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    const call = fetchImpl.mock.calls[0]
    expect(call).toBeDefined()
    const url = call?.[0]
    const init = call?.[1]
    expect(String(url)).toBe(`${BASE_URL}/auth/google`)
    expect(init?.method).toBe('POST')
    expect(init?.body).toBe(JSON.stringify({ credential }))
    expect(init?.credentials).toBe('omit')
    expect(init?.cache).toBe('no-store')
    expect(init?.mode).toBe('cors')

    const headers = new Headers(init?.headers)
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(headers.get('Accept')).toBe('application/json')
  })

  it('нормализует завершающий слэш в baseUrl', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(LOGIN_PAYLOAD))
    const api = createRemoteApi({ baseUrl: `${BASE_URL}/`, fetchImpl })

    await api.loginWithGoogle('credential')

    const call = fetchImpl.mock.calls[0]
    expect(call).toBeDefined()
    expect(String(call?.[0])).toBe(`${BASE_URL}/auth/google`)
  })

  it('получает текущего пользователя с Bearer-токеном', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(ME_PAYLOAD))
    const api = createRemoteApi({ baseUrl: BASE_URL, fetchImpl })

    const result = await api.me('session-token-value')

    expect(result).toEqual(ME_PAYLOAD)
    const call = fetchImpl.mock.calls[0]
    expect(call).toBeDefined()
    const url = call?.[0]
    const init = call?.[1]
    expect(String(url)).toBe(`${BASE_URL}/auth/me`)
    expect(init?.method).toBe('GET')
    expect(init?.credentials).toBe('omit')
    expect(init?.cache).toBe('no-store')
    expect(init?.mode).toBe('cors')

    const headers = new Headers(init?.headers)
    expect(headers.get('Authorization')).toBe('Bearer session-token-value')
    expect(headers.get('Accept')).toBe('application/json')
  })

  it('не требует expiresAt в ответе /auth/me (совместимость со старым Worker)', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ user: ME_PAYLOAD.user, libraries: ME_PAYLOAD.libraries }),
    )
    const api = createRemoteApi({ baseUrl: BASE_URL, fetchImpl })

    const result = await api.me('session-token-value')

    expect(result).toEqual({ user: ME_PAYLOAD.user, libraries: ME_PAYLOAD.libraries })
  })

  it('выходит из текущей сессии: 204 без разбора тела', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 204 }),
    )
    const api = createRemoteApi({ baseUrl: BASE_URL, fetchImpl })

    await expect(api.logout('session-token-value')).resolves.toBeUndefined()

    const call = fetchImpl.mock.calls[0]
    expect(call).toBeDefined()
    const url = call?.[0]
    const init = call?.[1]
    expect(String(url)).toBe(`${BASE_URL}/auth/logout`)
    expect(init?.method).toBe('POST')
    const headers = new Headers(init?.headers)
    expect(headers.get('Authorization')).toBe('Bearer session-token-value')
  })

  it('выходит из всех сессий: 204 без разбора тела', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 204 }),
    )
    const api = createRemoteApi({ baseUrl: BASE_URL, fetchImpl })

    await expect(api.logoutAll('session-token-value')).resolves.toBeUndefined()

    const call = fetchImpl.mock.calls[0]
    expect(call).toBeDefined()
    const url = call?.[0]
    const init = call?.[1]
    expect(String(url)).toBe(`${BASE_URL}/auth/logout-all`)
    expect(init?.method).toBe('POST')
  })
})

describe('createRemoteApi: ошибки сервера', () => {
  it('берёт код и статус из конверта ошибки', async () => {
    const cases: ReadonlyArray<[number, ApiErrorCode]> = [
      [400, 'BAD_REQUEST'],
      [401, 'UNAUTHORIZED'],
      [403, 'EMAIL_NOT_ALLOWED'],
      [429, 'RATE_LIMITED'],
      [500, 'INTERNAL'],
      [503, 'UNAVAILABLE'],
    ]

    for (const [status, code] of cases) {
      const fetchImpl = vi.fn<typeof fetch>(async () =>
        jsonResponse({ error: { code, message: 'server message' } }, status),
      )
      const api = createRemoteApi({ baseUrl: BASE_URL, fetchImpl })

      const error = await captureError(() => api.loginWithGoogle('credential-value'))

      expect(error.failure).toBe('http')
      expect(error.status).toBe(status)
      expect(error.code).toBe(code)
      expect(error.message).not.toContain('credential-value')
      expect(error.message).not.toContain('server message')
    }
  })

  it('маппит HTTP-статус, если конверта нет или тело не JSON', async () => {
    const cases: ReadonlyArray<[number, ApiErrorCode | undefined]> = [
      [400, 'BAD_REQUEST'],
      [401, 'UNAUTHORIZED'],
      [403, 'FORBIDDEN'],
      [404, 'NOT_FOUND'],
      [409, 'CONFLICT'],
      [413, 'PAYLOAD_TOO_LARGE'],
      [429, 'RATE_LIMITED'],
      [502, 'INTERNAL'],
      [503, 'UNAVAILABLE'],
      [418, undefined],
    ]

    for (const [status, code] of cases) {
      const fetchImpl = vi.fn<typeof fetch>(async () =>
        textResponse('not a json envelope', status),
      )
      const api = createRemoteApi({ baseUrl: BASE_URL, fetchImpl })

      const error = await captureError(() => api.me('session-token-value'))

      expect(error.failure).toBe('http')
      expect(error.status).toBe(status)
      expect(error.code).toBe(code)
    }
  })

  it('игнорирует неизвестный код в конверте и падает на маппинг статуса', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ error: { code: 'TEAPOT', message: 'nope' } }, 500),
    )
    const api = createRemoteApi({ baseUrl: BASE_URL, fetchImpl })

    const error = await captureError(() => api.loginWithGoogle('credential'))

    expect(error.failure).toBe('http')
    expect(error.code).toBe('INTERNAL')
    expect(error.status).toBe(500)
  })
})

describe('createRemoteApi: сбои транспорта и разбора', () => {
  it('трактует TypeError от fetch как сетевую ошибку', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(
      new TypeError('Failed to fetch'),
    )
    const api = createRemoteApi({ baseUrl: BASE_URL, fetchImpl })

    const error = await captureError(() => api.loginWithGoogle('credential'))

    expect(error.failure).toBe('network')
    expect(error.status).toBeUndefined()
    expect(error.code).toBeUndefined()
    expect(error.message).toContain('Нет связи с сервером')
  })

  it('трактует AbortError как таймаут', async () => {
    const abortError = Object.assign(new Error('Aborted'), { name: 'AbortError' })
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(abortError)
    const api = createRemoteApi({ baseUrl: BASE_URL, fetchImpl })

    const error = await captureError(() => api.me('session-token-value'))

    expect(error.failure).toBe('timeout')
    expect(error.message).toContain('Сервер не ответил вовремя')
  })

  it('завершает запрос по таймауту, даже если fetch не отвечает', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn<typeof fetch>(() => new Promise<Response>(() => {}))
    const api = createRemoteApi({ baseUrl: BASE_URL, fetchImpl, timeoutMs: 100 })

    const pending = captureError(() => api.me('session-token-value'))
    await vi.advanceTimersByTimeAsync(100)
    const error = await pending

    expect(error.failure).toBe('timeout')
    expect(error.message).toContain('Сервер не ответил вовремя')
  })

  it('сообщает о неожиданном JSON в успешном ответе', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response('{broken', { status: 200 }),
    )
    const api = createRemoteApi({ baseUrl: BASE_URL, fetchImpl })

    const error = await captureError(() => api.loginWithGoogle('credential'))

    expect(error.failure).toBe('parse')
    expect(error.message).toContain('Сервер вернул неожиданный ответ')
  })

  it('сообщает о неполном ответе входа', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        expiresAt: '2026-12-16T10:00:00.000Z',
        user: ME_PAYLOAD.user,
        libraries: ME_PAYLOAD.libraries,
      }),
    )
    const api = createRemoteApi({ baseUrl: BASE_URL, fetchImpl })

    const error = await captureError(() => api.loginWithGoogle('credential'))

    expect(error.failure).toBe('parse')
  })
})

describe('createRemoteApi: безопасность сообщений', () => {
  it('не включает токен в текст ошибки', async () => {
    const token = 'secret-session-token-value'
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      textResponse('internal failure', 500),
    )
    const api = createRemoteApi({ baseUrl: BASE_URL, fetchImpl })

    const error = await captureError(() => api.me(token))

    expect(error.message).not.toContain(token)
    expect(error.message).toContain('На сервере произошла ошибка')
  })

  it('не включает credential в текст ошибки', async () => {
    const credential = 'secret-google-credential'
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'invalid' } }, 401),
    )
    const api = createRemoteApi({ baseUrl: BASE_URL, fetchImpl })

    const error = await captureError(() => api.loginWithGoogle(credential))

    expect(error.message).not.toContain(credential)
  })
})

describe('createRemoteApi: проверка baseUrl', () => {
  it('бросает обычную Error при пустом baseUrl', () => {
    let caught: unknown
    try {
      createRemoteApi({ baseUrl: '' })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(Error)
    expect(caught).not.toBeInstanceOf(RemoteApiError)
    expect((caught as Error).message).toBe('baseUrl обязателен')
  })

  it('отклоняет пустую строку, относительный URL и не-http(s) схему', () => {
    const invalidUrls = ['   ', '/api/v1', 'api/v1', 'ftp://example.com/api/v1']

    for (const baseUrl of invalidUrls) {
      expect(() => createRemoteApi({ baseUrl }), baseUrl).toThrow('baseUrl обязателен')
    }
  })

  it('по-прежнему убирает завершающие слэши у валидного URL', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(LOGIN_PAYLOAD))
    const api = createRemoteApi({ baseUrl: 'https://example.com/api/v1///', fetchImpl })

    await api.loginWithGoogle('credential')

    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      'https://example.com/api/v1/auth/google',
    )
  })
})
