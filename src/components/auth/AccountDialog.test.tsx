import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/context/AuthContext'
import { RemoteApiError } from '@/lib/api'
import type { LoginResponse, MeResponse, RemoteApi } from '@/lib/api'
import { ensureGoogleGis, renderGoogleButton } from '@/lib/auth/google'
import { createSessionStore } from '@/lib/auth/session'
import type { AuthSession, SessionStore } from '@/lib/auth/session'
import type { PublicConfig } from '@/lib/config'
import { STORAGE_KEYS } from '@/lib/constants'
import { AccountDialog } from './AccountDialog'

// GIS изолирован: диалог проверяется без сети и без скрипта Google.
vi.mock('@/lib/auth/google', () => ({
  ensureGoogleGis: vi.fn(),
  renderGoogleButton: vi.fn(),
  disableAutoSelect: vi.fn(),
}))

const ensureGoogleGisMock = vi.mocked(ensureGoogleGis)
const renderGoogleButtonMock = vi.mocked(renderGoogleButton)

const NOW = Date.parse('2026-11-16T00:00:00.000Z')
const NOW_FN = (): number => NOW
const TOKEN = 'test_token-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

const TEST_CONFIG: PublicConfig = {
  apiBaseUrl: 'https://api.example.test/api/v1',
  googleClientId: '1234567890-abcdefghijklmnop.apps.googleusercontent.com',
  authEnabled: true,
  authDisabledReason: null,
}

const LOGIN_RESPONSE: LoginResponse = {
  token: TOKEN,
  expiresAt: '2099-01-01T00:00:00.000Z',
  user: { id: 'user-1', email: 'user@example.com', name: 'Иван', picture: null },
  libraries: [{ id: 'library-1', name: 'Моя библиотека', role: 'owner' }],
}

const ME_RESPONSE: MeResponse = {
  user: {
    id: 'user-1',
    email: 'user@example.com',
    name: 'Иван Обновлённый',
    picture: null,
  },
  libraries: [
    { id: 'library-1', name: 'Моя библиотека', role: 'owner' },
    { id: 'library-2', name: 'Общая библиотека', role: 'editor' },
  ],
}

function makeSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    version: 1,
    token: TOKEN,
    expiresAt: '2026-12-01T00:00:00.000Z',
    user: { id: 'user-1', email: 'user@example.com', name: 'Иван', picture: null },
    libraries: [{ id: 'library-1', name: 'Моя библиотека', role: 'owner' }],
    ...overrides,
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

interface RenderDialogOptions {
  api: RemoteApi
  session?: AuthSession
  config?: PublicConfig
  /** Подмена хранилища: позволяет отдать сессию, не проходящую валидацию. */
  sessionStore?: SessionStore
}

function renderDialog({
  api,
  session,
  config = TEST_CONFIG,
  sessionStore: injectedStore,
}: RenderDialogOptions) {
  const storage = createMemoryStorage()
  const sessionStore = injectedStore ?? createSessionStore(storage)
  if (session) sessionStore.write(session)

  const onClose = vi.fn()
  const user = userEvent.setup()
  const result = render(
    <AuthProvider api={api} sessionStore={sessionStore} config={config} now={NOW_FN}>
      <AccountDialog open onClose={onClose} />
    </AuthProvider>,
  )

  return { ...result, user, onClose, sessionStore, storage }
}

/** Дожидается отрисовки кнопки GIS и возвращает аргументы вызова. */
async function googleButtonCall() {
  await waitFor(() => expect(renderGoogleButtonMock).toHaveBeenCalled())
  return renderGoogleButtonMock.mock.calls[0]
}

beforeEach(() => {
  ensureGoogleGisMock.mockReset()
  renderGoogleButtonMock.mockReset()
  ensureGoogleGisMock.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('AccountDialog: анонимный режим', () => {
  it('показывает описание, кнопку входа и строку приватности без сетевых вызовов', async () => {
    const { api, loginWithGoogle, me } = createApiHarness()
    renderDialog({ api })

    expect(screen.getByRole('heading', { name: 'Аккаунт' })).toBeInTheDocument()
    expect(
      screen.getByText(/Вход нужен для будущей синхронизации/),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Токен хранится в этом браузере, e-mail проверяется на сервере.'),
    ).toBeInTheDocument()

    await googleButtonCall()

    expect(loginWithGoogle).not.toHaveBeenCalled()
    expect(me).not.toHaveBeenCalled()
  })

  it('передаёт кнопке Google Client ID из конфигурации провайдера', async () => {
    const { api } = createApiHarness()
    renderDialog({ api })

    const [, options] = await googleButtonCall()

    // Без передачи config кнопка взяла бы Client ID из окружения по умолчанию.
    expect(options.clientId).toBe(TEST_CONFIG.googleClientId)
  })

  it('показывает inline-ошибку входа с текстом из messages', async () => {
    const { api, loginWithGoogle } = createApiHarness()
    loginWithGoogle.mockRejectedValue(
      new RemoteApiError('http', 'Клиентский текст', {
        code: 'EMAIL_NOT_ALLOWED',
        status: 403,
      }),
    )
    renderDialog({ api })

    const [, options] = await googleButtonCall()
    await act(async () => {
      options.onCredential('google-credential')
    })

    expect(loginWithGoogle).toHaveBeenCalledWith('google-credential')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Этот аккаунт не разрешён. Попросите добавить ваш e-mail в список доступа.',
    )
  })

  it('блокирует вход, пока запрос выполняется, и игнорирует повторный credential', async () => {
    const { api, loginWithGoogle } = createApiHarness()
    let resolveLogin: ((value: LoginResponse) => void) | undefined
    loginWithGoogle.mockImplementation(
      () =>
        new Promise<LoginResponse>((resolve) => {
          resolveLogin = resolve
        }),
    )
    renderDialog({ api })

    const [element, options] = await googleButtonCall()
    await act(async () => {
      options.onCredential('credential-1')
    })

    await waitFor(() => expect(element).toHaveAttribute('aria-disabled', 'true'))

    await act(async () => {
      options.onCredential('credential-2')
    })
    expect(loginWithGoogle).toHaveBeenCalledTimes(1)
    expect(loginWithGoogle).toHaveBeenCalledWith('credential-1')

    await act(async () => {
      resolveLogin?.(LOGIN_RESPONSE)
    })
    expect(await screen.findByText('Иван')).toBeInTheDocument()
  })

  it('показывает notice об истёкшей сессии даже без входа', async () => {
    const { api, me } = createApiHarness()
    renderDialog({
      api,
      session: makeSession({ expiresAt: '2020-01-01T00:00:00.000Z' }),
    })

    expect(screen.getByText('Сессия истекла. Войдите снова.')).toBeInTheDocument()
    expect(me).not.toHaveBeenCalled()
  })

  it('при выключенном входе показывает notice и не загружает Google GIS', () => {
    const { api, loginWithGoogle } = createApiHarness()
    const disabledConfig: PublicConfig = {
      ...TEST_CONFIG,
      authEnabled: false,
      authDisabledReason: 'Вход отключён в этой сборке.',
    }
    renderDialog({ api, config: disabledConfig })

    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Вход не настроен в этой сборке')
    // Причина передана из контекста, а не взята из окружения по умолчанию.
    expect(status).toHaveTextContent('Вход отключён в этой сборке.')
    expect(ensureGoogleGisMock).not.toHaveBeenCalled()
    expect(renderGoogleButtonMock).not.toHaveBeenCalled()
    expect(loginWithGoogle).not.toHaveBeenCalled()
  })
})

describe('AccountDialog: инициалы аватара', () => {
  it('берёт первые буквы имени и фамилии', async () => {
    const { api, me } = createApiHarness()
    me.mockRejectedValue(new RemoteApiError('network', 'Нет связи с сервером.'))
    renderDialog({
      api,
      session: makeSession({
        user: {
          id: 'user-1',
          email: 'user@example.com',
          name: 'Иван Петров',
          picture: null,
        },
      }),
    })

    expect(await screen.findByText('Иван Петров')).toBeInTheDocument()
    expect(screen.getByText('ИП')).toBeInTheDocument()
  })

  it('показывает «?», если нет ни имени, ни e-mail', async () => {
    const { api, me } = createApiHarness()
    me.mockRejectedValue(new RemoteApiError('network', 'Нет связи с сервером.'))
    const session = makeSession({
      user: { id: 'user-1', email: '', name: null, picture: null },
    })
    const sessionStore: SessionStore = {
      read: () => session,
      readRaw: () => ({ status: 'valid', session }),
      write: () => true,
      clear: () => undefined,
    }

    renderDialog({ api, session, sessionStore })

    expect(await screen.findByText('?')).toBeInTheDocument()
  })
})

describe('AccountDialog: авторизованный режим', () => {
  it('показывает профиль, библиотеки и дату сессии, запрашивая /auth/me один раз', async () => {
    const { api, me } = createApiHarness()
    me.mockResolvedValue(ME_RESPONSE)
    const { sessionStore } = renderDialog({ api, session: makeSession() })

    await waitFor(() => expect(me).toHaveBeenCalledTimes(1))
    expect(me).toHaveBeenCalledWith(TOKEN)

    expect(await screen.findByText('Иван Обновлённый')).toBeInTheDocument()
    expect(screen.getByText('user@example.com')).toBeInTheDocument()
    expect(screen.getByText('Моя библиотека')).toBeInTheDocument()
    expect(screen.getByText('Общая библиотека')).toBeInTheDocument()
    expect(screen.getByText('владелец')).toBeInTheDocument()
    expect(screen.getByText('редактор')).toBeInTheDocument()
    expect(screen.getByText(/Сессия действует до/)).toBeInTheDocument()
    expect(screen.getByText(/Синхронизация ещё не включена/)).toBeInTheDocument()

    expect(sessionStore.read(NOW)?.user.name).toBe('Иван Обновлённый')
  })

  it('не разрывает emoji в инициалах аватара', async () => {
    const { api, me } = createApiHarness()
    me.mockRejectedValue(new RemoteApiError('network', 'Нет связи с сервером.'))
    renderDialog({
      api,
      session: makeSession({
        user: {
          id: 'user-1',
          email: 'user@example.com',
          name: '🎵 Producer',
          picture: null,
        },
      }),
    })

    expect(await screen.findByText('🎵 Producer')).toBeInTheDocument()
    const initials = screen.getByText('🎵P')
    expect(initials.textContent).toBe('🎵P')
    expect(initials.textContent).not.toContain('�')
  })

  it('«Обновить данные» повторно вызывает api.me', async () => {
    const { api, me } = createApiHarness()
    me.mockResolvedValue(ME_RESPONSE)
    const { user } = renderDialog({ api, session: makeSession() })

    await waitFor(() => expect(me).toHaveBeenCalledTimes(1))
    const refreshButton = screen.getByRole('button', { name: 'Обновить данные' })
    await waitFor(() => expect(refreshButton).toBeEnabled())

    await user.click(refreshButton)

    await waitFor(() => expect(me).toHaveBeenCalledTimes(2))
  })

  it('«Выйти» очищает сессию и возвращает анонимное состояние', async () => {
    const { api, me, logout } = createApiHarness()
    me.mockResolvedValue(ME_RESPONSE)
    const { user, sessionStore } = renderDialog({ api, session: makeSession() })

    await waitFor(() => expect(me).toHaveBeenCalledTimes(1))
    const logoutButton = screen.getByRole('button', { name: 'Выйти' })
    await waitFor(() => expect(logoutButton).toBeEnabled())

    await user.click(logoutButton)

    await waitFor(() => expect(logout).toHaveBeenCalledWith(TOKEN))
    expect(sessionStore.read(NOW)).toBeNull()
    expect(
      await screen.findByText(/Вход нужен для будущей синхронизации/),
    ).toBeInTheDocument()
  })

  it('«Выйти на всех устройствах» требует подтверждения и вызывает api.logoutAll', async () => {
    const { api, me, logoutAll } = createApiHarness()
    me.mockResolvedValue(ME_RESPONSE)
    const { user, sessionStore } = renderDialog({ api, session: makeSession() })

    await waitFor(() => expect(me).toHaveBeenCalledTimes(1))
    const trigger = screen.getByRole('button', { name: 'Выйти на всех устройствах' })
    await waitFor(() => expect(trigger).toBeEnabled())

    await user.click(trigger)

    expect(logoutAll).not.toHaveBeenCalled()
    const confirmTitle = screen.getByText('Выйти на всех устройствах?')
    expect(confirmTitle.closest('dialog')?.hasAttribute('open')).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Выйти везде' }))

    await waitFor(() => expect(logoutAll).toHaveBeenCalledWith(TOKEN))
    expect(sessionStore.read(NOW)).toBeNull()
  })

  it('не показывает подтверждение выхода везде после повторного входа', async () => {
    const { api, me, loginWithGoogle } = createApiHarness()
    me.mockResolvedValue(ME_RESPONSE)
    loginWithGoogle.mockResolvedValue(LOGIN_RESPONSE)
    const { user, sessionStore } = renderDialog({ api, session: makeSession() })

    await waitFor(() => expect(me).toHaveBeenCalledTimes(1))
    const trigger = screen.getByRole('button', { name: 'Выйти на всех устройствах' })
    await waitFor(() => expect(trigger).toBeEnabled())
    await user.click(trigger)

    expect(
      screen
        .getByText('Выйти на всех устройствах?')
        .closest('dialog')
        ?.hasAttribute('open'),
    ).toBe(true)

    // Сессия завершилась в другой вкладке, пока подтверждение было открыто.
    act(() => {
      sessionStore.clear()
      window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEYS.authSession }))
    })

    const [, options] = await googleButtonCall()
    await act(async () => {
      options.onCredential('google-credential')
    })

    // После повторного входа диалог подтверждения не должен открываться сам.
    await waitFor(() => {
      const dialog = screen
        .getByText('Выйти на всех устройствах?')
        .closest('dialog')
      expect(dialog?.hasAttribute('open')).toBe(false)
    })
  })

  it('показывает inline-ошибку обновления и блокирует кнопки на время запроса', async () => {
    const { api, me } = createApiHarness()
    let resolveMe: ((value: MeResponse) => void) | undefined
    me.mockImplementation(
      () =>
        new Promise<MeResponse>((resolve) => {
          resolveMe = resolve
        }),
    )
    renderDialog({ api, session: makeSession() })

    await waitFor(() => expect(me).toHaveBeenCalledTimes(1))
    await waitFor(() => {
      // Во время загрузки в кнопку добавляется спиннер с подписью «Загрузка»,
      // поэтому доступное имя содержит и её — ищем по подстроке.
      expect(screen.getByRole('button', { name: /Обновить данные/ })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Выйти' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Выйти на всех устройствах' })).toBeDisabled()
    })

    await act(async () => {
      resolveMe?.(ME_RESPONSE)
    })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Обновить данные' })).toBeEnabled(),
    )
  })

  it('при сетевой ошибке обновления показывает текст из messages и сохраняет профиль', async () => {
    const { api, me } = createApiHarness()
    me.mockRejectedValue(new RemoteApiError('network', 'Нет связи с сервером.'))
    renderDialog({ api, session: makeSession() })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Нет связи с сервером. Проверьте подключение к интернету и попробуйте снова.',
    )
    expect(screen.getByText('Иван')).toBeInTheDocument()
  })
})

// Ключ сессии используется только косвенно через createSessionStore;
// проверяем, что хранилище не содержит посторонних записей после входа.
describe('AccountDialog: хранилище', () => {
  it('не пишет в хранилище ничего, кроме сессии', async () => {
    const { api, me } = createApiHarness()
    me.mockResolvedValue(ME_RESPONSE)
    const { storage } = renderDialog({ api, session: makeSession() })

    await waitFor(() => expect(me).toHaveBeenCalledTimes(1))

    expect(storage.length).toBe(1)
    expect(storage.getItem(STORAGE_KEYS.authSession)).not.toBeNull()
  })
})
