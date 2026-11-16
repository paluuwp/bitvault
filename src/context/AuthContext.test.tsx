import { StrictMode } from 'react'
import type { ReactNode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RemoteApiError, createRemoteApi } from '../lib/api'
import type { LoginResponse, MeResponse, RemoteApi } from '../lib/api'
import { createSessionStore } from '../lib/auth/session'
import type { AuthSession } from '../lib/auth/session'
import type { PublicConfig } from '../lib/config'
import { STORAGE_KEYS } from '../lib/constants'
import { AUTH_NOTICES, AuthProvider, useAuth } from './AuthContext'
import type { AuthProviderProps } from './AuthContext'

const NOW = Date.parse('2026-11-16T00:00:00.000Z')
const NOW_FN = (): number => NOW
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
const VALID_TOKEN = 'test_token-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const KEY = STORAGE_KEYS.authSession

const TEST_CONFIG: PublicConfig = {
  apiBaseUrl: 'https://api.example.test/api/v1',
  googleClientId: '1234567890-abcdefghijklmnop.apps.googleusercontent.com',
  authEnabled: true,
  authDisabledReason: null,
}

const LOGIN_RESPONSE: LoginResponse = {
  token: VALID_TOKEN,
  expiresAt: '2099-01-01T00:00:00.000Z',
  user: {
    id: 'user-1',
    email: 'user@example.com',
    name: 'Иван',
    picture: null,
  },
  libraries: [{ id: 'library-1', name: 'Моя библиотека', role: 'owner' }],
}

const ME_RESPONSE: MeResponse = {
  user: {
    id: 'user-1',
    email: 'user@example.com',
    name: 'Иван Обновлённый',
    picture: 'https://example.com/avatar.png',
  },
  libraries: [
    { id: 'library-1', name: 'Моя библиотека', role: 'owner' },
    { id: 'library-2', name: 'Общая библиотека', role: 'editor' },
  ],
}

function makeSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    version: 1,
    token: VALID_TOKEN,
    expiresAt: '2026-12-01T00:00:00.000Z',
    user: {
      id: 'user-1',
      email: 'user@example.com',
      name: 'Иван',
      picture: null,
    },
    libraries: [{ id: 'library-1', name: 'Моя библиотека', role: 'owner' }],
    ...overrides,
  }
}

function sessionFromLogin(response: LoginResponse): AuthSession {
  return {
    version: 1,
    token: response.token,
    expiresAt: response.expiresAt,
    user: { ...response.user },
    libraries: response.libraries.map((library) => ({ ...library })),
  }
}

function createMemoryStorage(): Storage {
  const items = new Map<string, string>()
  return {
    get length(): number {
      return items.size
    },
    clear(): void {
      items.clear()
    },
    getItem(key: string): string | null {
      return items.get(key) ?? null
    },
    key(index: number): string | null {
      return Array.from(items.keys())[index] ?? null
    },
    removeItem(key: string): void {
      items.delete(key)
    },
    setItem(key: string, value: string): void {
      items.set(key, value)
    },
  }
}

function createApiHarness() {
  const loginWithGoogle = vi.fn<RemoteApi['loginWithGoogle']>()
  const me = vi.fn<RemoteApi['me']>()
  const logout = vi.fn<RemoteApi['logout']>(async () => undefined)
  const logoutAll = vi.fn<RemoteApi['logoutAll']>(async () => undefined)
  const api: RemoteApi = { loginWithGoogle, me, logout, logoutAll }
  return { api, loginWithGoogle, me, logout, logoutAll }
}

type ProviderOverrides = Partial<Omit<AuthProviderProps, 'children'>>

function createWrapper(overrides: ProviderOverrides) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <AuthProvider {...overrides}>{children}</AuthProvider>
  }
}

function createStrictWrapper(overrides: ProviderOverrides) {
  const Base = createWrapper(overrides)
  return function StrictWrapper({ children }: { children: ReactNode }) {
    return (
      <StrictMode>
        <Base>{children}</Base>
      </StrictMode>
    )
  }
}

function useAuthForTest() {
  return useAuth()
}

function renderAuth(overrides: ProviderOverrides) {
  return renderHook(useAuthForTest, { wrapper: createWrapper(overrides) })
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('AuthProvider: инициализация', () => {
  it('не делает сетевых вызовов при монтировании без сессии', () => {
    const fetchImpl = vi.fn<typeof fetch>()
    const api = createRemoteApi({ baseUrl: TEST_CONFIG.apiBaseUrl, fetchImpl })
    const { result } = renderAuth({
      api,
      sessionStore: createSessionStore(createMemoryStorage()),
      config: TEST_CONFIG,
      now: NOW_FN,
    })

    expect(result.current.status).toBe('anonymous')
    expect(result.current.session).toBeNull()
    expect(result.current.busy).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('восстанавливает сессию из хранилища без сети', () => {
    const fetchImpl = vi.fn<typeof fetch>()
    const api = createRemoteApi({ baseUrl: TEST_CONFIG.apiBaseUrl, fetchImpl })
    const sessionStore = createSessionStore(createMemoryStorage())
    const session = makeSession()
    sessionStore.write(session)

    const { result } = renderAuth({
      api,
      sessionStore,
      config: TEST_CONFIG,
      now: NOW_FN,
    })

    expect(result.current.status).toBe('authenticated')
    expect(result.current.session).toEqual(session)
    expect(result.current.persisted).toBe(true)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('при истёкшей записи выходит и показывает notice', () => {
    const { api, loginWithGoogle, me } = createApiHarness()
    const sessionStore = createSessionStore(createMemoryStorage())
    sessionStore.write(makeSession({ expiresAt: '2020-01-01T00:00:00.000Z' }))

    const { result } = renderAuth({
      api,
      sessionStore,
      config: TEST_CONFIG,
      now: NOW_FN,
    })

    expect(result.current.status).toBe('anonymous')
    expect(result.current.session).toBeNull()
    expect(result.current.notice).toBe(AUTH_NOTICES.sessionExpired)
    expect(sessionStore.read(NOW)).toBeNull()
    expect(loginWithGoogle).not.toHaveBeenCalled()
    expect(me).not.toHaveBeenCalled()
  })

  it('битую запись удаляет без notice', () => {
    const storage = createMemoryStorage()
    storage.setItem(KEY, '{broken')
    const sessionStore = createSessionStore(storage)
    const { api } = createApiHarness()

    const { result } = renderAuth({
      api,
      sessionStore,
      config: TEST_CONFIG,
      now: NOW_FN,
    })

    expect(result.current.status).toBe('anonymous')
    expect(result.current.notice).toBeNull()
    expect(storage.getItem(KEY)).toBeNull()
  })

  it('в StrictMode не теряет notice об истёкшей сессии', () => {
    const sessionStore = createSessionStore(createMemoryStorage())
    sessionStore.write(makeSession({ expiresAt: '2020-01-01T00:00:00.000Z' }))
    const { api } = createApiHarness()

    const { result } = renderHook(useAuthForTest, {
      wrapper: createStrictWrapper({
        api,
        sessionStore,
        config: TEST_CONFIG,
        now: NOW_FN,
      }),
    })

    expect(result.current.status).toBe('anonymous')
    expect(result.current.notice).toBe(AUTH_NOTICES.sessionExpired)
    expect(sessionStore.read(NOW)).toBeNull()
  })
})

describe('AuthProvider: вход', () => {
  it('сохраняет сессию и вызывает API', async () => {
    const { api, loginWithGoogle } = createApiHarness()
    loginWithGoogle.mockResolvedValue(LOGIN_RESPONSE)
    const sessionStore = createSessionStore(createMemoryStorage())

    const { result } = renderAuth({
      api,
      sessionStore,
      config: TEST_CONFIG,
      now: NOW_FN,
    })

    await act(async () => {
      await result.current.loginWithCredential('google-credential')
    })

    expect(loginWithGoogle).toHaveBeenCalledWith('google-credential')
    expect(result.current.status).toBe('authenticated')
    expect(result.current.session).toEqual(sessionFromLogin(LOGIN_RESPONSE))
    expect(result.current.error).toBeNull()
    expect(result.current.notice).toBeNull()
    expect(result.current.persisted).toBe(true)
    expect(result.current.busy).toBeNull()
    expect(sessionStore.read(NOW)).toEqual(sessionFromLogin(LOGIN_RESPONSE))
  })

  it('игнорирует повторный вход, пока идёт первый', async () => {
    const { api, loginWithGoogle } = createApiHarness()
    let resolveLogin: ((value: LoginResponse) => void) | undefined
    loginWithGoogle.mockImplementation(
      () =>
        new Promise<LoginResponse>((resolve) => {
          resolveLogin = resolve
        }),
    )
    const sessionStore = createSessionStore(createMemoryStorage())

    const { result } = renderAuth({
      api,
      sessionStore,
      config: TEST_CONFIG,
      now: NOW_FN,
    })

    let firstLogin: Promise<void> = Promise.resolve()
    act(() => {
      firstLogin = result.current.loginWithCredential('credential-1')
    })
    expect(result.current.busy).toBe('login')

    let secondLogin: Promise<void> = Promise.resolve()
    act(() => {
      secondLogin = result.current.loginWithCredential('credential-2')
    })
    expect(loginWithGoogle).toHaveBeenCalledTimes(1)
    expect(loginWithGoogle).toHaveBeenCalledWith('credential-1')

    await act(async () => {
      resolveLogin?.(LOGIN_RESPONSE)
      await firstLogin
      await secondLogin
    })

    expect(result.current.status).toBe('authenticated')
    expect(result.current.busy).toBeNull()
  })

  it('сохраняет ошибку и не трогает локальную сессию', async () => {
    const { api, loginWithGoogle } = createApiHarness()
    const serverError = new RemoteApiError('http', 'Клиентский текст ошибки', {
      code: 'EMAIL_NOT_ALLOWED',
      status: 403,
    })
    loginWithGoogle.mockRejectedValue(serverError)
    const sessionStore = createSessionStore(createMemoryStorage())

    const { result } = renderAuth({
      api,
      sessionStore,
      config: TEST_CONFIG,
      now: NOW_FN,
    })

    await act(async () => {
      await result.current.loginWithCredential('google-credential')
    })

    expect(result.current.status).toBe('anonymous')
    expect(result.current.session).toBeNull()
    expect(result.current.error).toBe(serverError)
    expect(result.current.notice).toBeNull()
    expect(result.current.busy).toBeNull()
    expect(sessionStore.read(NOW)).toBeNull()

    act(() => {
      result.current.clearError()
    })
    expect(result.current.error).toBeNull()
  })

  it('не сохраняет ответ входа с коротким токеном', async () => {
    const { api, loginWithGoogle } = createApiHarness()
    loginWithGoogle.mockResolvedValue({ ...LOGIN_RESPONSE, token: 'short' })
    const sessionStore = createSessionStore(createMemoryStorage())

    const { result } = renderAuth({
      api,
      sessionStore,
      config: TEST_CONFIG,
      now: NOW_FN,
    })

    await act(async () => {
      await result.current.loginWithCredential('google-credential')
    })

    expect(result.current.status).toBe('anonymous')
    expect(result.current.session).toBeNull()
    expect(result.current.error?.failure).toBe('parse')
    expect(sessionStore.read(NOW)).toBeNull()
  })

  it('не сохраняет ответ входа с невалидным expiresAt', async () => {
    const { api, loginWithGoogle } = createApiHarness()
    loginWithGoogle.mockResolvedValue({ ...LOGIN_RESPONSE, expiresAt: 'завтра' })
    const sessionStore = createSessionStore(createMemoryStorage())

    const { result } = renderAuth({
      api,
      sessionStore,
      config: TEST_CONFIG,
      now: NOW_FN,
    })

    await act(async () => {
      await result.current.loginWithCredential('google-credential')
    })

    expect(result.current.status).toBe('anonymous')
    expect(result.current.session).toBeNull()
    expect(result.current.error?.failure).toBe('parse')
    expect(sessionStore.read(NOW)).toBeNull()
  })

  it('сообщает, если сессию не удалось сохранить', async () => {
    const { api, loginWithGoogle } = createApiHarness()
    loginWithGoogle.mockResolvedValue(LOGIN_RESPONSE)
    const storage = createMemoryStorage()
    storage.setItem = (): void => {
      throw new DOMException('Переполнение', 'QuotaExceededError')
    }
    const sessionStore = createSessionStore(storage)

    const { result } = renderAuth({
      api,
      sessionStore,
      config: TEST_CONFIG,
      now: NOW_FN,
    })

    await act(async () => {
      await result.current.loginWithCredential('google-credential')
    })

    expect(result.current.status).toBe('authenticated')
    expect(result.current.persisted).toBe(false)
    expect(result.current.notice).toBe(AUTH_NOTICES.sessionNotPersisted)
    expect(sessionStore.read(NOW)).toBeNull()
  })
})

describe('AuthProvider: обновление сессии', () => {
  it('обновляет пользователя и сохраняет expiresAt, если сервер его не прислал', async () => {
    const { api, me } = createApiHarness()
    me.mockResolvedValue(ME_RESPONSE)
    const sessionStore = createSessionStore(createMemoryStorage())
    const session = makeSession()
    sessionStore.write(session)

    const { result } = renderAuth({
      api,
      sessionStore,
      config: TEST_CONFIG,
      now: NOW_FN,
    })

    await act(async () => {
      await result.current.refreshAccount()
    })

    expect(me).toHaveBeenCalledWith(VALID_TOKEN)
    expect(result.current.status).toBe('authenticated')
    expect(result.current.session?.user).toEqual(ME_RESPONSE.user)
    expect(result.current.session?.libraries).toEqual(ME_RESPONSE.libraries)
    // Старый Worker не присылает expiresAt: успешный /auth/me сам срок не двигает.
    expect(result.current.session?.expiresAt).toBe(session.expiresAt)
    expect(result.current.persisted).toBe(true)
    expect(result.current.busy).toBeNull()
    expect(sessionStore.read(NOW)?.expiresAt).toBe(session.expiresAt)
  })

  it('применяет серверный expiresAt из /auth/me и обновляет профиль', async () => {
    const { api, me } = createApiHarness()
    const serverExpiresAt = '2027-05-01T00:00:00.000Z'
    me.mockResolvedValue({ ...ME_RESPONSE, expiresAt: serverExpiresAt })
    const sessionStore = createSessionStore(createMemoryStorage())
    sessionStore.write(makeSession())

    const { result } = renderAuth({
      api,
      sessionStore,
      config: TEST_CONFIG,
      now: NOW_FN,
    })

    await act(async () => {
      await result.current.refreshAccount()
    })

    expect(me).toHaveBeenCalledWith(VALID_TOKEN)
    expect(result.current.status).toBe('authenticated')
    // Серверный срок — авторитет, даже если локально сессия ещё не истекла.
    expect(result.current.session?.expiresAt).toBe(serverExpiresAt)
    expect(result.current.session?.user).toEqual(ME_RESPONSE.user)
    expect(result.current.session?.libraries).toEqual(ME_RESPONSE.libraries)
    expect(sessionStore.read(NOW)?.expiresAt).toBe(serverExpiresAt)
    expect(result.current.busy).toBeNull()
  })

  it('применяет и более короткий серверный срок сессии', async () => {
    const { api, me } = createApiHarness()
    // Сервер отзывает сессию раньше локального срока — клиент обязан это учесть.
    const serverExpiresAt = '2026-11-20T00:00:00.000Z'
    me.mockResolvedValue({ ...ME_RESPONSE, expiresAt: serverExpiresAt })
    const sessionStore = createSessionStore(createMemoryStorage())
    sessionStore.write(makeSession())

    const { result } = renderAuth({
      api,
      sessionStore,
      config: TEST_CONFIG,
      now: NOW_FN,
    })

    await act(async () => {
      await result.current.refreshAccount()
    })

    expect(result.current.session?.expiresAt).toBe(serverExpiresAt)
    expect(sessionStore.read(NOW)?.expiresAt).toBe(serverExpiresAt)
  })

  it('игнорирует невалидный серверный expiresAt и сохраняет текущий срок', async () => {
    const { api, me } = createApiHarness()
    // Date.parse такую строку принимает, но parseSession отвергает: применить её
    // значило бы сохранить сессию, которую следующая загрузка не прочитает.
    me.mockResolvedValue({ ...ME_RESPONSE, expiresAt: 'Tue, 01 Dec 2026 00:00:00 GMT' })
    const sessionStore = createSessionStore(createMemoryStorage())
    const session = makeSession()
    sessionStore.write(session)

    const { result } = renderAuth({
      api,
      sessionStore,
      config: TEST_CONFIG,
      now: NOW_FN,
    })

    await act(async () => {
      await result.current.refreshAccount()
    })

    expect(result.current.status).toBe('authenticated')
    expect(result.current.session?.expiresAt).toBe(session.expiresAt)
    expect(result.current.session?.user).toEqual(ME_RESPONSE.user)
    expect(sessionStore.read(NOW)?.expiresAt).toBe(session.expiresAt)
  })

  it('продлевает локально истёкшую сессию, которую сервер подтвердил', async () => {
    const { api, me } = createApiHarness()
    me.mockResolvedValue(ME_RESPONSE)
    let currentNow = NOW
    const clock = (): number => currentNow
    const sessionStore = createSessionStore(createMemoryStorage())
    sessionStore.write(
      makeSession({ expiresAt: new Date(NOW + 5 * 60_000).toISOString() }),
    )

    const { result } = renderAuth({
      api,
      sessionStore,
      config: TEST_CONFIG,
      now: clock,
    })
    expect(result.current.status).toBe('authenticated')

    // Локально сессия уже считается истёкшей (с учётом запаса), но сервер
    // отвечает успешно — значит, жизнь сессии подтверждена.
    currentNow = NOW + 5 * 60_000

    await act(async () => {
      await result.current.refreshAccount()
    })

    expect(result.current.status).toBe('authenticated')
    expect(result.current.session?.expiresAt).toBe(
      new Date(currentNow + THIRTY_DAYS_MS).toISOString(),
    )
    expect(sessionStore.read(currentNow)?.expiresAt).toBe(
      new Date(currentNow + THIRTY_DAYS_MS).toISOString(),
    )
  })

  it('при 401 очищает сессию и показывает notice', async () => {
    const { api, me } = createApiHarness()
    me.mockRejectedValue(
      new RemoteApiError('http', 'Сессия истекла.', {
        code: 'UNAUTHORIZED',
        status: 401,
      }),
    )
    const sessionStore = createSessionStore(createMemoryStorage())
    sessionStore.write(makeSession())

    const { result } = renderAuth({
      api,
      sessionStore,
      config: TEST_CONFIG,
      now: NOW_FN,
    })

    await act(async () => {
      await result.current.refreshAccount()
    })

    expect(result.current.status).toBe('anonymous')
    expect(result.current.session).toBeNull()
    expect(result.current.error).toBeNull()
    expect(result.current.notice).toBe(AUTH_NOTICES.sessionExpired)
    expect(sessionStore.read(NOW)).toBeNull()
  })

  it('при сетевой ошибке сохраняет сессию и ставит error', async () => {
    const { api, me } = createApiHarness()
    const networkError = new RemoteApiError('network', 'Нет связи с сервером.')
    me.mockRejectedValue(networkError)
    const sessionStore = createSessionStore(createMemoryStorage())
    const session = makeSession()
    sessionStore.write(session)

    const { result } = renderAuth({
      api,
      sessionStore,
      config: TEST_CONFIG,
      now: NOW_FN,
    })

    await act(async () => {
      await result.current.refreshAccount()
    })

    expect(result.current.status).toBe('authenticated')
    expect(result.current.session).toEqual(session)
    expect(result.current.error).toBe(networkError)
    expect(result.current.notice).toBeNull()
    expect(sessionStore.read(NOW)).toEqual(session)
  })

  it('ничего не делает без сессии', async () => {
    const { api, me } = createApiHarness()
    const { result } = renderAuth({
      api,
      sessionStore: createSessionStore(createMemoryStorage()),
      config: TEST_CONFIG,
      now: NOW_FN,
    })

    await act(async () => {
      await result.current.refreshAccount()
    })

    expect(me).not.toHaveBeenCalled()
    expect(result.current.busy).toBeNull()
  })
})

describe('AuthProvider: выход', () => {
  it('очищает сессию сразу, даже если api.logout падает, и сообщает о неподтверждённом выходе', async () => {
    const { api, logout } = createApiHarness()
    logout.mockRejectedValue(new TypeError('Нет сети'))
    const sessionStore = createSessionStore(createMemoryStorage())
    const session = makeSession()
    sessionStore.write(session)

    const { result } = renderAuth({
      api,
      sessionStore,
      config: TEST_CONFIG,
      now: NOW_FN,
    })

    let pending: Promise<void> = Promise.resolve()
    act(() => {
      pending = result.current.logout()
    })

    expect(result.current.status).toBe('anonymous')
    expect(result.current.session).toBeNull()
    expect(sessionStore.read(NOW)).toBeNull()

    await act(async () => {
      await pending
    })

    expect(logout).toHaveBeenCalledWith(session.token)
    expect(result.current.error).toBeNull()
    // Локальный выход состоялся, но сервер его не подтвердил — это видно.
    expect(result.current.notice).toBe(AUTH_NOTICES.logoutUnconfirmed)
    expect(result.current.busy).toBeNull()
  })

  it('logoutEverywhere очищает сессию при ошибке и показывает notice', async () => {
    const { api, logoutAll } = createApiHarness()
    logoutAll.mockRejectedValue(new RemoteApiError('network', 'Нет связи с сервером.'))
    const sessionStore = createSessionStore(createMemoryStorage())
    const session = makeSession()
    sessionStore.write(session)

    const { result } = renderAuth({
      api,
      sessionStore,
      config: TEST_CONFIG,
      now: NOW_FN,
    })

    await act(async () => {
      await result.current.logoutEverywhere()
    })

    expect(logoutAll).toHaveBeenCalledWith(session.token)
    expect(result.current.status).toBe('anonymous')
    expect(result.current.error).toBeNull()
    expect(result.current.notice).toBe(AUTH_NOTICES.logoutEverywhereUnconfirmed)
    expect(result.current.busy).toBeNull()
    expect(sessionStore.read(NOW)).toBeNull()
  })

  it('logoutEverywhere без ошибки не показывает notice', async () => {
    const { api, logoutAll } = createApiHarness()
    logoutAll.mockResolvedValue(undefined)
    const sessionStore = createSessionStore(createMemoryStorage())
    sessionStore.write(makeSession())

    const { result } = renderAuth({
      api,
      sessionStore,
      config: TEST_CONFIG,
      now: NOW_FN,
    })

    await act(async () => {
      await result.current.logoutEverywhere()
    })

    expect(result.current.status).toBe('anonymous')
    expect(result.current.notice).toBeNull()
    expect(sessionStore.read(NOW)).toBeNull()
  })

  it('logoutEverywhere не затирает notice, появившийся во время запроса', async () => {
    vi.useFakeTimers()
    const { api, logoutAll } = createApiHarness()
    logoutAll.mockImplementation(() => new Promise<void>(() => {}))
    const sessionStore = createSessionStore(createMemoryStorage())
    sessionStore.write(makeSession())

    const { result, unmount } = renderAuth({
      api,
      sessionStore,
      config: TEST_CONFIG,
      now: NOW_FN,
    })

    let pending: Promise<void> = Promise.resolve()
    act(() => {
      pending = result.current.logoutEverywhere()
    })
    expect(result.current.busy).toBe('logoutAll')

    // Пока серверный выход не подтверждён, в другой вкладке сессия истекла.
    act(() => {
      sessionStore.write(makeSession({ expiresAt: '2020-01-01T00:00:00.000Z' }))
      window.dispatchEvent(new StorageEvent('storage', { key: KEY }))
    })
    expect(result.current.notice).toBe(AUTH_NOTICES.sessionExpired)

    // Даже таймаут выхода не затирает notice, выставленный во время запроса.
    await act(async () => {
      vi.advanceTimersByTime(5_000)
      await pending
    })

    expect(result.current.notice).toBe(AUTH_NOTICES.sessionExpired)
    expect(result.current.notice).not.toBe(AUTH_NOTICES.logoutEverywhereUnconfirmed)
    expect(result.current.busy).toBeNull()

    unmount()
    vi.useRealTimers()
  })

  it('различает notice о выходе и о выходе на всех устройствах', () => {
    expect(AUTH_NOTICES.logoutUnconfirmed).not.toBe(AUTH_NOTICES.logoutEverywhereUnconfirmed)
    expect(AUTH_NOTICES.logoutEverywhereUnconfirmed).toContain('на всех устройствах')
    expect(AUTH_NOTICES.logoutUnconfirmed).not.toContain('на всех устройствах')
  })
})

describe('AuthProvider: синхронизация вкладок и таймер', () => {
  it('реагирует на storage-событие по ключу сессии', () => {
    const { api } = createApiHarness()
    const sessionStore = createSessionStore(createMemoryStorage())
    const initial = makeSession()
    sessionStore.write(initial)

    const { result } = renderAuth({
      api,
      sessionStore,
      config: TEST_CONFIG,
      now: NOW_FN,
    })
    expect(result.current.status).toBe('authenticated')

    act(() => {
      sessionStore.clear()
      window.dispatchEvent(new StorageEvent('storage', { key: KEY }))
    })

    expect(result.current.status).toBe('anonymous')
    expect(result.current.session).toBeNull()

    const replacement = makeSession({
      token: 'replacement_token-ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    })
    sessionStore.write(replacement)
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: KEY }))
    })

    expect(result.current.status).toBe('authenticated')
    expect(result.current.session?.token).toBe(replacement.token)
  })

  it('игнорирует storage-события других ключей', () => {
    const { api } = createApiHarness()
    const sessionStore = createSessionStore(createMemoryStorage())
    sessionStore.write(makeSession())

    const { result } = renderAuth({
      api,
      sessionStore,
      config: TEST_CONFIG,
      now: NOW_FN,
    })

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEYS.view }))
    })

    expect(result.current.status).toBe('authenticated')
  })

  it('завершает сессию по таймеру и очищает хранилище', () => {
    vi.useFakeTimers()
    let currentNow = Date.parse('2026-11-16T00:00:00.000Z')
    const clock = (): number => currentNow
    const sessionStore = createSessionStore(createMemoryStorage())
    sessionStore.write(makeSession({ expiresAt: '2026-11-16T00:02:00.000Z' }))
    const { api } = createApiHarness()

    const { result, unmount } = renderAuth({
      api,
      sessionStore,
      config: TEST_CONFIG,
      now: clock,
    })
    expect(result.current.status).toBe('authenticated')

    act(() => {
      currentNow += 60_000
      vi.advanceTimersByTime(60_000)
    })

    expect(result.current.status).toBe('anonymous')
    expect(result.current.session).toBeNull()
    expect(result.current.notice).toBe(AUTH_NOTICES.sessionExpired)
    expect(sessionStore.read(currentNow)).toBeNull()

    unmount()
    vi.useRealTimers()
  })

  it('не разлогинивает, если срок истёк во время refresh, и принимает его ответ', async () => {
    vi.useFakeTimers()
    let currentNow = Date.parse('2026-11-16T00:00:00.000Z')
    const clock = (): number => currentNow
    const { api, me } = createApiHarness()
    let resolveMe: ((value: MeResponse) => void) | undefined
    me.mockImplementation(
      () =>
        new Promise<MeResponse>((resolve) => {
          resolveMe = resolve
        }),
    )
    const sessionStore = createSessionStore(createMemoryStorage())
    sessionStore.write(makeSession({ expiresAt: '2026-11-16T00:02:00.000Z' }))

    const { result, unmount } = renderAuth({
      api,
      sessionStore,
      config: TEST_CONFIG,
      now: clock,
    })
    expect(result.current.status).toBe('authenticated')

    let pending: Promise<void> = Promise.resolve()
    act(() => {
      pending = result.current.refreshAccount()
    })
    expect(result.current.busy).toBe('refresh')

    // Таймер истечения срабатывает, пока refresh ещё в полёте.
    act(() => {
      currentNow += 60_000
      vi.advanceTimersByTime(60_000)
    })

    expect(result.current.status).toBe('authenticated')
    expect(result.current.session).not.toBeNull()
    expect(result.current.notice).toBeNull()

    await act(async () => {
      resolveMe?.(ME_RESPONSE)
      await pending
    })

    expect(me).toHaveBeenCalledWith(VALID_TOKEN)
    expect(result.current.status).toBe('authenticated')
    expect(result.current.session?.user).toEqual(ME_RESPONSE.user)
    expect(result.current.notice).toBeNull()

    unmount()
    vi.useRealTimers()
  })

  it('очищает сессию после сетевого сбоя refresh, если она успела истечь', async () => {
    vi.useFakeTimers()
    let currentNow = Date.parse('2026-11-16T00:00:00.000Z')
    const clock = (): number => currentNow
    const { api, me } = createApiHarness()
    let rejectMe: ((reason: unknown) => void) | undefined
    me.mockImplementation(
      () =>
        new Promise<MeResponse>((_, reject) => {
          rejectMe = reject
        }),
    )
    const sessionStore = createSessionStore(createMemoryStorage())
    sessionStore.write(
      makeSession({ expiresAt: new Date(NOW + 2 * 60_000).toISOString() }),
    )

    const { result, unmount } = renderAuth({
      api,
      sessionStore,
      config: TEST_CONFIG,
      now: clock,
    })
    expect(result.current.status).toBe('authenticated')

    let pending: Promise<void> = Promise.resolve()
    act(() => {
      pending = result.current.refreshAccount()
    })
    expect(result.current.busy).toBe('refresh')

    // Пока запрос в полёте, локальный срок проходит: таймер не разлогинивает,
    // а перепроверяет состояние раз в секунду.
    act(() => {
      currentNow += 60_000
      vi.advanceTimersByTime(60_000)
    })
    expect(result.current.status).toBe('authenticated')
    expect(result.current.session).not.toBeNull()

    const networkError = new RemoteApiError('network', 'Нет связи с сервером.')
    await act(async () => {
      rejectMe?.(networkError)
      await pending
    })

    expect(result.current.status).toBe('authenticated')
    expect(result.current.error).toBe(networkError)

    // Следующая перепроверка видит, что refresh уже не идёт, и завершает сессию.
    act(() => {
      currentNow += 1_000
      vi.advanceTimersByTime(1_000)
    })

    expect(result.current.status).toBe('anonymous')
    expect(result.current.session).toBeNull()
    expect(result.current.notice).toBe(AUTH_NOTICES.sessionExpired)
    expect(sessionStore.read(currentNow)).toBeNull()

    unmount()
    vi.useRealTimers()
  })
})

describe('AuthProvider: нет валидной конфигурации', () => {
  it('не создаёт клиент и не делает сетевых вызовов', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
    const sessionStore = createSessionStore(createMemoryStorage())
    sessionStore.write(makeSession())
    const disabledConfig: PublicConfig = {
      ...TEST_CONFIG,
      apiBaseUrl: '',
      authEnabled: false,
      authDisabledReason: 'Вход отключён в этой сборке.',
    }

    // api не передан: провайдер обязан остаться без клиента.
    const { result } = renderAuth({
      sessionStore,
      config: disabledConfig,
      now: NOW_FN,
    })

    await act(async () => {
      await result.current.loginWithCredential('google-credential')
    })
    expect(fetchMock).not.toHaveBeenCalled()
    // Выключенный вход — это notice о конфигурации, а не сетевая ошибка.
    expect(result.current.error).toBeNull()
    expect(result.current.notice).toBe(AUTH_NOTICES.authNotConfigured)
    expect(result.current.busy).toBeNull()

    await act(async () => {
      await result.current.refreshAccount()
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.status).toBe('authenticated')
    expect(result.current.notice).toBe(AUTH_NOTICES.authNotConfigured)

    await act(async () => {
      await result.current.logout()
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.status).toBe('anonymous')
    expect(sessionStore.read(NOW)).toBeNull()
  })

  it('logoutEverywhere при authEnabled=false с валидным apiBaseUrl не делает запросов', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
    const sessionStore = createSessionStore(createMemoryStorage())
    sessionStore.write(makeSession())
    const disabledConfig: PublicConfig = {
      ...TEST_CONFIG,
      authEnabled: false,
      authDisabledReason: 'Вход отключён в этой сборке.',
    }

    const { result } = renderAuth({
      sessionStore,
      config: disabledConfig,
      now: NOW_FN,
    })
    expect(result.current.status).toBe('authenticated')

    await act(async () => {
      await result.current.logoutEverywhere()
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.busy).toBeNull()
    expect(result.current.status).toBe('anonymous')
    expect(sessionStore.read(NOW)).toBeNull()
  })
})
