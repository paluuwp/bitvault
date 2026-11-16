/* eslint-disable react-refresh/only-export-components -- провайдер и хук по плану живут в одном файле */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  RemoteApiError,
  createRemoteApi,
  isRemoteApiError,
  messageForFailure,
} from '@/lib/api'
import type { LoginResponse, RemoteApi } from '@/lib/api'
import {
  SESSION_EXPIRY_SKEW_MS,
  createSessionStore,
  isIsoTimestamp,
  isSessionExpired,
  parseSession,
} from '@/lib/auth/session'
import type { AuthSession, SessionReadResult, SessionStore } from '@/lib/auth/session'
import { resolvePublicConfig } from '@/lib/config'
import type { PublicConfig } from '@/lib/config'
import { STORAGE_KEYS } from '@/lib/constants'

export type AuthStatus = 'anonymous' | 'authenticated'

export type AuthBusy = 'login' | 'refresh' | 'logout' | 'logoutAll' | null

/** Пользовательские тексты, которые контекст выставляет в notice. */
export const AUTH_NOTICES = {
  sessionExpired: 'Сессия истекла. Войдите снова.',
  sessionNotPersisted:
    'Не удалось сохранить сессию в браузере. После перезагрузки войдите снова.',
  logoutEverywhereUnconfirmed:
    'Локально вы вышли, но сервер мог не подтвердить выход на всех устройствах',
  logoutUnconfirmed: 'Локально вы вышли, но сервер мог не подтвердить выход',
  /** Вход выключен или публичная конфигурация API некорректна. */
  authNotConfigured: 'Вход не настроен в этой сборке',
} as const

export interface AuthContextValue {
  status: AuthStatus
  session: AuthSession | null
  busy: AuthBusy
  error: RemoteApiError | null
  notice: string | null
  /** true, если текущая сессия сохранена в localStorage. */
  persisted: boolean
  config: PublicConfig
  loginWithCredential(credential: string): Promise<void>
  refreshAccount(): Promise<void>
  logout(): Promise<void>
  logoutEverywhere(): Promise<void>
  clearError(): void
}

export interface AuthProviderProps {
  children: ReactNode
  /** Только для тестов и внедрения: готовый клиент API. */
  api?: RemoteApi
  /** Только для тестов и внедрения: хранилище сессии. */
  sessionStore?: SessionStore
  /** Только для тестов и внедрения: публичная конфигурация. */
  config?: PublicConfig
  /** Только для тестов: источник текущего времени. */
  now?: () => number
}

const AuthContext = createContext<AuthContextValue | null>(null)

const SESSION_EXTENSION_MS = 30 * 24 * 60 * 60 * 1000
const MAX_EXPIRY_TIMER_MS = 24 * 60 * 60 * 1000
const LOGOUT_TIMEOUT_MS = 5_000
/** Как часто перепроверять срок, пока обновление сессии ещё в полёте. */
const EXPIRY_RECHECK_MS = 1_000

type AuthOperation = Exclude<AuthBusy, null>

function systemNow(): number {
  return Date.now()
}

interface InitialSessionState {
  status: SessionReadResult['status']
  session: AuthSession | null
  notice: string | null
}

/**
 * Читает состояние сессии, не удаляя запись.
 *
 * Внедрённое хранилище может не реализовывать `readRaw` (например, простой
 * мок в тестах); тогда используется обычное чтение.
 */
function readSessionState(store: SessionStore, now: number): SessionReadResult {
  try {
    if (typeof store.readRaw === 'function') return store.readRaw(now)
    const session = store.read(now)
    return session ? { status: 'valid', session } : { status: 'none' }
  } catch {
    // Внедрённое хранилище не должно ломать рендер провайдера.
    return { status: 'none' }
  }
}

/**
 * Синхронно читает сессию без побочных эффектов.
 *
 * `readRaw` намеренно ничего не удаляет: инициализатор состояния может
 * выполняться повторно (StrictMode), а удаление выполняет эффект монтирования.
 */
function readInitialSession(store: SessionStore, now: () => number): InitialSessionState {
  const result = readSessionState(store, now())
  if (result.status === 'valid') {
    return { status: result.status, session: result.session, notice: null }
  }
  if (result.status === 'expired') {
    return { status: result.status, session: null, notice: AUTH_NOTICES.sessionExpired }
  }
  return { status: result.status, session: null, notice: null }
}

function sessionFromLogin(response: LoginResponse): AuthSession {
  return {
    version: 1,
    token: response.token,
    expiresAt: response.expiresAt,
    user: {
      id: response.user.id,
      email: response.user.email,
      name: response.user.name,
      picture: response.user.picture,
    },
    libraries: response.libraries.map((library) => ({
      id: library.id,
      name: library.name,
      role: library.role,
    })),
  }
}

function isUnauthorized(error: RemoteApiError): boolean {
  return error.code === 'UNAUTHORIZED' || (error.failure === 'http' && error.status === 401)
}

function toRemoteApiError(caught: unknown): RemoteApiError {
  if (isRemoteApiError(caught)) return caught
  // Клиент API всегда бросает RemoteApiError; сюда попадает только чужой сбой.
  return new RemoteApiError('network', 'Не удалось выполнить запрос. Попробуйте снова.')
}

/**
 * Ждёт промис не дольше таймаута и сообщает, завершился ли он успешно.
 * Нужен для best-effort выхода: локальная сессия уже очищена, а по результату
 * выставляется notice о неподтверждённом выходе.
 */
function settleWithinTimeout(promise: Promise<unknown>, timeoutMs: number): Promise<boolean> {
  const settled = promise.then(
    () => true,
    () => false,
  )

  let timerId: number | undefined
  const timeout = new Promise<boolean>((resolve) => {
    timerId = window.setTimeout(() => resolve(false), timeoutMs)
  })

  return Promise.race([settled, timeout]).finally(() => {
    if (timerId !== undefined) window.clearTimeout(timerId)
  })
}

export function AuthProvider({ children, api, sessionStore, config, now }: AuthProviderProps) {
  const clock = now ?? systemNow

  const resolvedConfig = useMemo(() => config ?? resolvePublicConfig(), [config])
  const resolvedStore = useMemo(() => sessionStore ?? createSessionStore(), [sessionStore])

  /**
   * Клиент API создаётся лениво и только при корректной конфигурации.
   *
   * Без валидного базового URL и включённого входа сетевые методы не должны
   * выполняться вовсе: иначе Bearer-токен ушёл бы на origin приложения.
   * Инъекция через пропсы важнее конфигурации — тесты и интеграции передают
   * готовый клиент.
   */
  const resolvedApi = useMemo<RemoteApi | null>(() => {
    if (api) return api
    if (!resolvedConfig.authEnabled || !resolvedConfig.apiBaseUrl) return null
    try {
      return createRemoteApi({ baseUrl: resolvedConfig.apiBaseUrl })
    } catch {
      // Некорректный URL в конфигурации — работаем без сети (fail-closed).
      return null
    }
  }, [api, resolvedConfig.authEnabled, resolvedConfig.apiBaseUrl])

  const [initial] = useState(() => readInitialSession(resolvedStore, clock))
  const [session, setSession] = useState<AuthSession | null>(initial.session)
  const [busy, setBusy] = useState<AuthBusy>(null)
  const [error, setError] = useState<RemoteApiError | null>(null)
  const [notice, setNotice] = useState<string | null>(initial.notice)
  const [persisted, setPersisted] = useState(true)

  const sessionRef = useRef<AuthSession | null>(session)
  sessionRef.current = session

  const busyRef = useRef<AuthBusy>(null)
  /** Поколение сессии: результаты запросов старого поколения отбрасываются. */
  const epochRef = useRef(0)

  const beginOperation = useCallback((kind: AuthOperation): boolean => {
    if (busyRef.current !== null) return false
    busyRef.current = kind
    setBusy(kind)
    return true
  }, [])

  const endOperation = useCallback((kind: AuthOperation): void => {
    if (busyRef.current !== kind) return
    busyRef.current = null
    setBusy(null)
  }, [])

  const clearLocalSession = useCallback(
    (nextNotice: string | null): void => {
      epochRef.current += 1
      resolvedStore.clear()
      setSession(null)
      setPersisted(true)
      setError(null)
      setNotice(nextNotice)
    },
    [resolvedStore],
  )

  const applySession = useCallback(
    (next: AuthSession): void => {
      const saved = resolvedStore.write(next)
      setSession(next)
      setPersisted(saved)
      setError(null)
      setNotice(saved ? null : AUTH_NOTICES.sessionNotPersisted)
    },
    [resolvedStore],
  )

  // Невалидная или истёкшая запись, найденная при старте, удаляется один раз.
  useEffect(() => {
    if (initial.status === 'expired' || initial.status === 'invalid') {
      resolvedStore.clear()
    }
  }, [initial.status, resolvedStore])

  const loginWithCredential = useCallback(
    async (credential: string): Promise<void> => {
      if (!resolvedApi) {
        // Это не сбой сети, а выключенный вход: показываем notice, а не ошибку.
        setNotice(AUTH_NOTICES.authNotConfigured)
        return
      }
      if (!beginOperation('login')) return
      const epoch = epochRef.current

      try {
        const response = await resolvedApi.loginWithGoogle(credential)
        if (epochRef.current !== epoch) {
          // Пользователь вышел, пока шёл вход: не сохраняем сессию и гасим её на сервере.
          void resolvedApi.logout(response.token).catch(() => undefined)
          return
        }
        // Ответ сервера проверяется теми же правилами, что и запись из
        // localStorage: иначе короткий токен или невалидный срок попали бы
        // в состояние приложения.
        const parsed = parseSession(sessionFromLogin(response))
        if (!parsed) throw new RemoteApiError('parse', messageForFailure('parse', 'login'))
        applySession(parsed)
      } catch (caught) {
        if (epochRef.current !== epoch) return
        setError(toRemoteApiError(caught))
      } finally {
        endOperation('login')
      }
    },
    [applySession, beginOperation, endOperation, resolvedApi],
  )

  const refreshAccount = useCallback(async (): Promise<void> => {
    const current = sessionRef.current
    if (!current) return
    if (!resolvedApi) {
      // Без настроенного API проверка сессии невозможна: сеть не трогаем.
      setNotice(AUTH_NOTICES.authNotConfigured)
      return
    }
    if (!beginOperation('refresh')) return
    const epoch = epochRef.current

    try {
      const account = await resolvedApi.me(current.token)
      if (epochRef.current !== epoch) return

      // Авторитет по сроку сессии — сервер и ответ 401. Свежий Worker
      // возвращает в /auth/me актуальный expiresAt с учётом продления;
      // применяем его, если он есть и разбирается в дату. Иначе (старый
      // Worker или мусор) сохраняем прежний срок, а локально истёкшую
      // сессию, которую сервер подтвердил, продлеваем на 30 дней.
      const nowMs = clock()
      // Та же проверка, что и при чтении сессии: иначе дата, которую
      // `Date.parse` принимает, но `parseSession` — нет, сохранилась бы
      // в localStorage и потеряла сессию при следующей загрузке.
      const serverExpiresAt = isIsoTimestamp(account.expiresAt)
        ? account.expiresAt
        : null
      const localExpired = isSessionExpired(current, nowMs)
      const extended: AuthSession = {
        ...current,
        expiresAt:
          serverExpiresAt ??
          (localExpired
            ? new Date(nowMs + SESSION_EXTENSION_MS).toISOString()
            : current.expiresAt),
        user: {
          id: account.user.id,
          email: account.user.email,
          name: account.user.name,
          picture: account.user.picture,
        },
        libraries: account.libraries.map((library) => ({
          id: library.id,
          name: library.name,
          role: library.role,
        })),
      }
      applySession(extended)
    } catch (caught) {
      if (epochRef.current !== epoch) return

      const apiError = toRemoteApiError(caught)
      if (isUnauthorized(apiError)) {
        clearLocalSession(AUTH_NOTICES.sessionExpired)
      } else {
        setError(apiError)
      }
    } finally {
      endOperation('refresh')
    }
  }, [applySession, beginOperation, clearLocalSession, clock, endOperation, resolvedApi])

  const logout = useCallback(async (): Promise<void> => {
    const token = sessionRef.current?.token ?? null
    clearLocalSession(null)
    // Без настроенного API выходим только локально: серверной сессии нет.
    if (!token || !resolvedApi) return

    busyRef.current = 'logout'
    setBusy('logout')
    try {
      const confirmed = await settleWithinTimeout(
        resolvedApi.logout(token),
        LOGOUT_TIMEOUT_MS,
      )
      if (!confirmed) {
        // Не затираем notice, который мог появиться, пока шёл выход.
        setNotice((current) => current ?? AUTH_NOTICES.logoutUnconfirmed)
      }
    } catch {
      // Синхронный бросок из api.logout тоже означает неподтверждённый выход.
      setNotice((current) => current ?? AUTH_NOTICES.logoutUnconfirmed)
    } finally {
      if (busyRef.current === 'logout') {
        busyRef.current = null
        setBusy(null)
      }
    }
  }, [clearLocalSession, resolvedApi])

  const logoutEverywhere = useCallback(async (): Promise<void> => {
    const token = sessionRef.current?.token ?? null
    clearLocalSession(null)
    // Без настроенного API локальный выход — единственное доступное действие.
    if (!token || !resolvedApi) return

    busyRef.current = 'logoutAll'
    setBusy('logoutAll')
    try {
      const confirmed = await settleWithinTimeout(
        resolvedApi.logoutAll(token),
        LOGOUT_TIMEOUT_MS,
      )
      if (!confirmed) {
        // Не затираем notice, который мог появиться, пока шёл выход.
        setNotice((current) => current ?? AUTH_NOTICES.logoutEverywhereUnconfirmed)
      }
    } catch {
      // Синхронный бросок из api.logoutAll тоже означает неподтверждённый выход.
      setNotice((current) => current ?? AUTH_NOTICES.logoutEverywhereUnconfirmed)
    } finally {
      if (busyRef.current === 'logoutAll') {
        busyRef.current = null
        setBusy(null)
      }
    }
  }, [clearLocalSession, resolvedApi])

  const clearError = useCallback((): void => {
    setError(null)
  }, [])

  // Таймер истечения: не дольше 24 часов за раз, срок перепроверяется при
  // каждом срабатывании. Сетевых вызовов здесь нет.
  useEffect(() => {
    if (!session) return
    const activeSession = session
    let timerId: number | undefined
    let cancelled = false

    const schedule = (): void => {
      if (cancelled) return
      if (isSessionExpired(activeSession, clock())) {
        if (busyRef.current === 'refresh') {
          // Обновление уже в полёте: его успешный ответ может продлить сессию.
          // Не разлогиниваем, а перепроверяем срок чуть позже.
          timerId = window.setTimeout(() => {
            timerId = undefined
            schedule()
          }, EXPIRY_RECHECK_MS)
          return
        }
        clearLocalSession(AUTH_NOTICES.sessionExpired)
        return
      }

      const remaining =
        Date.parse(activeSession.expiresAt) - clock() - SESSION_EXPIRY_SKEW_MS
      const delay = Math.min(Math.max(remaining, 1), MAX_EXPIRY_TIMER_MS)
      timerId = window.setTimeout(() => {
        timerId = undefined
        schedule()
      }, delay)
    }

    schedule()
    return () => {
      cancelled = true
      if (timerId !== undefined) window.clearTimeout(timerId)
    }
  }, [clearLocalSession, clock, session])

  // Выход или вход в другой вкладке: перечитываем запись из хранилища.
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleStorage = (event: StorageEvent): void => {
      if (event.key !== null && event.key !== STORAGE_KEYS.authSession) return

      const result = readSessionState(resolvedStore, clock())
      epochRef.current += 1

      if (result.status === 'valid') {
        setSession(result.session)
        setPersisted(true)
        setError(null)
        setNotice(null)
        return
      }

      if (result.status !== 'none') resolvedStore.clear()
      setSession(null)
      setPersisted(true)
      setError(null)
      setNotice(result.status === 'expired' ? AUTH_NOTICES.sessionExpired : null)
    }

    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [clock, resolvedStore])

  const value = useMemo<AuthContextValue>(
    () => ({
      status: session ? 'authenticated' : 'anonymous',
      session,
      busy,
      error,
      notice,
      persisted,
      config: resolvedConfig,
      loginWithCredential,
      refreshAccount,
      logout,
      logoutEverywhere,
      clearError,
    }),
    [
      session,
      busy,
      error,
      notice,
      persisted,
      resolvedConfig,
      loginWithCredential,
      refreshAccount,
      logout,
      logoutEverywhere,
      clearError,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth должен использоваться внутри AuthProvider')
  }
  return context
}
