import { afterEach, describe, expect, it } from 'vitest'
import {
  SESSION_EXPIRY_SKEW_MS,
  SESSION_MAX_RAW_BYTES,
  createSessionStore,
  isSessionExpired,
  parseSession,
  serializeSession,
} from '../auth/session'
import type { AuthSession } from '../auth/session'
import { STORAGE_KEYS } from '../constants'

const TOKEN = 'test_token-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const FUTURE_ISO = '2099-12-16T10:00:00.000Z'
const KEY = STORAGE_KEYS.authSession

function makeSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    version: 1,
    token: TOKEN,
    expiresAt: FUTURE_ISO,
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

function createThrowingStorage(): Storage {
  const fail = (): never => {
    throw new Error('Хранилище недоступно')
  }
  return {
    get length(): number {
      return fail()
    },
    clear: fail,
    getItem: fail,
    key: fail,
    removeItem: fail,
    setItem: fail,
  }
}

afterEach(() => {
  window.localStorage.removeItem(KEY)
})

describe('parseSession', () => {
  it('принимает корректную сессию и отбрасывает лишние поля', () => {
    const session = makeSession()
    const parsed = parseSession({ ...session, extra: 'игнорируется' })
    expect(parsed).toEqual(session)
  })

  it('требует version === 1', () => {
    expect(parseSession({ ...makeSession(), version: 2 })).toBeNull()
    expect(parseSession({ ...makeSession(), version: '1' })).toBeNull()
    expect(parseSession({ ...makeSession(), version: null })).toBeNull()
  })

  it('проверяет формат и длину токена', () => {
    const invalidTokens: unknown[] = [
      'a'.repeat(19),
      'a'.repeat(513),
      `${'a'.repeat(19)}.`,
      `${'a'.repeat(19)} `,
      '',
      42,
      null,
    ]
    for (const token of invalidTokens) {
      expect(parseSession({ ...makeSession(), token }), String(token)).toBeNull()
    }

    expect(parseSession({ ...makeSession(), token: 'a'.repeat(20) })).not.toBeNull()
    expect(parseSession({ ...makeSession(), token: 'a'.repeat(512) })).not.toBeNull()
  })

  it('требует валидную ISO-дату в expiresAt', () => {
    const invalidDates: unknown[] = [
      '',
      'not-a-date',
      '2026-13-01T00:00:00.000Z',
      '2026-12-16',
      '2026-12-16T10:00:00.000',
      Date.now(),
      null,
    ]
    for (const expiresAt of invalidDates) {
      expect(parseSession({ ...makeSession(), expiresAt }), String(expiresAt)).toBeNull()
    }

    expect(
      parseSession({ ...makeSession(), expiresAt: '2026-12-16T10:00:00Z' }),
    ).not.toBeNull()
    expect(
      parseSession({ ...makeSession(), expiresAt: '2026-12-16T10:00:00+03:00' }),
    ).not.toBeNull()
  })

  it('проверяет пользователя', () => {
    const user = makeSession().user
    const invalidUsers: unknown[] = [
      null,
      'user',
      { ...user, id: '' },
      { ...user, id: 42 },
      { ...user, email: '' },
      { ...user, email: 'user.example.com' },
      { ...user, email: 42 },
      { ...user, name: 42 },
      { ...user, name: undefined },
      { ...user, picture: 42 },
    ]
    for (const invalidUser of invalidUsers) {
      expect(parseSession({ ...makeSession(), user: invalidUser })).toBeNull()
    }

    expect(parseSession({ ...makeSession(), user: { ...user, name: null } })).not.toBeNull()
  })

  it('проверяет библиотеки', () => {
    const library = makeSession().libraries[0]
    const invalidLibraries: unknown[] = [
      null,
      'libraries',
      {},
      [null],
      [{ ...library, id: '' }],
      [{ ...library, name: 42 }],
      [{ ...library, role: 42 }],
      [{ id: library.id, name: library.name }],
    ]
    for (const libraries of invalidLibraries) {
      expect(parseSession({ ...makeSession(), libraries })).toBeNull()
    }

    expect(parseSession({ ...makeSession(), libraries: [] })).not.toBeNull()
  })

  it('не принимает не-объекты', () => {
    expect(parseSession(null)).toBeNull()
    expect(parseSession('session')).toBeNull()
    expect(parseSession([])).toBeNull()
    expect(parseSession(42)).toBeNull()
  })
})

describe('serializeSession', () => {
  it('сериализует сессию так, что она читается обратно', () => {
    const session = makeSession()
    const restored = parseSession(JSON.parse(serializeSession(session)))
    expect(restored).toEqual(session)
  })
})

describe('isSessionExpired', () => {
  const now = Date.parse('2026-11-16T00:00:00.000Z')

  it('учитывает запас и границу срока', () => {
    const session = makeSession({
      expiresAt: new Date(now + 2 * SESSION_EXPIRY_SKEW_MS).toISOString(),
    })

    expect(isSessionExpired(session, now)).toBe(false)
    expect(isSessionExpired(session, now + SESSION_EXPIRY_SKEW_MS)).toBe(true)
    expect(isSessionExpired(session, now, 0)).toBe(false)
  })

  it('считает невалидную дату истёкшей', () => {
    expect(isSessionExpired(makeSession({ expiresAt: 'не дата' }), now)).toBe(true)
  })
})

describe('createSessionStore', () => {
  it('сохраняет, читает и удаляет сессию', () => {
    const storage = createMemoryStorage()
    const store = createSessionStore(storage)
    const session = makeSession()

    expect(store.read()).toBeNull()
    expect(store.write(session)).toBe(true)
    expect(storage.getItem(KEY)).not.toBeNull()
    expect(store.read()).toEqual(session)

    store.clear()
    expect(store.read()).toBeNull()
    expect(storage.getItem(KEY)).toBeNull()
  })

  it('по умолчанию использует window.localStorage', () => {
    const store = createSessionStore()
    const session = makeSession()

    expect(store.write(session)).toBe(true)
    expect(window.localStorage.getItem(KEY)).not.toBeNull()
    expect(store.read()).toEqual(session)

    store.clear()
    expect(window.localStorage.getItem(KEY)).toBeNull()
  })

  it('явный null даёт no-op хранилище и не трогает localStorage', () => {
    // В localStorage лежит посторонняя запись — null-хранилище её не видит
    // и не удаляет.
    window.localStorage.setItem(KEY, serializeSession(makeSession()))
    const store = createSessionStore(null)

    expect(store.readRaw()).toEqual({ status: 'none' })
    expect(store.read()).toBeNull()
    expect(store.write(makeSession())).toBe(false)
    expect(() => store.clear()).not.toThrow()
    expect(window.localStorage.getItem(KEY)).not.toBeNull()
  })

  it('readRaw сообщает причину и не меняет хранилище', () => {
    const storage = createMemoryStorage()
    const store = createSessionStore(storage)

    expect(store.readRaw()).toEqual({ status: 'none' })

    const session = makeSession()
    storage.setItem(KEY, serializeSession(session))
    expect(store.readRaw()).toEqual({ status: 'valid', session })

    storage.setItem(KEY, '{broken')
    expect(store.readRaw()).toEqual({ status: 'invalid' })
    expect(storage.getItem(KEY)).toBe('{broken')

    expect(store.read()).toBeNull()
    expect(storage.getItem(KEY)).toBeNull()
  })

  it('удаляет невалидные записи при чтении', () => {
    const cases: ReadonlyArray<[string, string]> = [
      ['битый JSON', '{broken'],
      ['неверная версия', JSON.stringify({ ...makeSession(), version: 2 })],
      ['короткий токен', JSON.stringify({ ...makeSession(), token: 'short' })],
      ['неверная дата', JSON.stringify({ ...makeSession(), expiresAt: 'вчера' })],
      [
        'неверный пользователь',
        JSON.stringify({ ...makeSession(), user: { ...makeSession().user, email: 'nope' } }),
      ],
      [
        'неверные библиотеки',
        JSON.stringify({ ...makeSession(), libraries: [{ id: 'x' }] }),
      ],
    ]

    for (const [label, raw] of cases) {
      const storage = createMemoryStorage()
      storage.setItem(KEY, raw)
      const store = createSessionStore(storage)

      expect(store.read(), label).toBeNull()
      expect(storage.getItem(KEY), label).toBeNull()
    }
  })

  it('удаляет истёкшую сессию и отличает её от отсутствующей', () => {
    const storage = createMemoryStorage()
    const session = makeSession({ expiresAt: '2000-01-01T00:00:00.000Z' })
    storage.setItem(KEY, serializeSession(session))
    const store = createSessionStore(storage)

    expect(store.readRaw()).toEqual({ status: 'expired' })
    expect(storage.getItem(KEY)).not.toBeNull()

    expect(store.read()).toBeNull()
    expect(storage.getItem(KEY)).toBeNull()
  })

  it('считает сессию истёкшей с учётом запаса', () => {
    const now = Date.parse('2026-11-16T00:00:00.000Z')
    const storage = createMemoryStorage()
    const session = makeSession({
      expiresAt: new Date(now + SESSION_EXPIRY_SKEW_MS - 1).toISOString(),
    })
    storage.setItem(KEY, serializeSession(session))
    const store = createSessionStore(storage)

    expect(store.readRaw(now)).toEqual({ status: 'expired' })
    expect(store.read(now)).toBeNull()
    expect(storage.getItem(KEY)).toBeNull()
  })

  it('удаляет запись больше 64 КиБ', () => {
    const storage = createMemoryStorage()
    const oversized = 'x'.repeat(SESSION_MAX_RAW_BYTES + 1)
    storage.setItem(KEY, oversized)
    const store = createSessionStore(storage)

    expect(store.readRaw()).toEqual({ status: 'invalid' })
    expect(store.read()).toBeNull()
    expect(storage.getItem(KEY)).toBeNull()
  })

  it('не сохраняет слишком большую сессию', () => {
    const storage = createMemoryStorage()
    const store = createSessionStore(storage)
    const libraries = Array.from({ length: 4000 }, (_, index) => ({
      id: `library-${index}`,
      name: 'Библиотека с длинным названием',
      role: 'owner',
    }))

    expect(store.write(makeSession({ libraries }))).toBe(false)
    expect(storage.getItem(KEY)).toBeNull()
  })

  it('не бросает при недоступном хранилище', () => {
    const store = createSessionStore(createThrowingStorage())

    expect(store.readRaw()).toEqual({ status: 'none' })
    expect(store.read()).toBeNull()
    expect(store.write(makeSession())).toBe(false)
    expect(() => store.clear()).not.toThrow()
  })

  it('возвращает false при переполнении хранилища', () => {
    const storage = createMemoryStorage()
    storage.setItem = (): void => {
      throw new DOMException('Переполнение', 'QuotaExceededError')
    }
    const store = createSessionStore(storage)

    expect(store.write(makeSession())).toBe(false)
  })

  it('не пересекается с настройками bv.view, bv.sort и bv.volume', () => {
    const storage = createMemoryStorage()
    storage.setItem(STORAGE_KEYS.view, 'grid')
    storage.setItem(STORAGE_KEYS.sort, 'name')
    storage.setItem(STORAGE_KEYS.volume, '0.5')

    const store = createSessionStore(storage)
    store.write(makeSession())
    store.clear()

    expect(storage.getItem(STORAGE_KEYS.view)).toBe('grid')
    expect(storage.getItem(STORAGE_KEYS.sort)).toBe('name')
    expect(storage.getItem(STORAGE_KEYS.volume)).toBe('0.5')
  })
})
