import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_API_BASE_URL,
  DEFAULT_GOOGLE_CLIENT_ID,
  resolvePublicConfig,
} from '../config'

const CUSTOM_API_URL = 'https://api.example.com/api/v1'
const OTHER_API_URL = 'https://other.example.com/v2/'
const CUSTOM_CLIENT_ID =
  '1234567890-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('resolvePublicConfig', () => {
  it('использует дефолты при пустых переменных окружения', () => {
    vi.stubEnv('VITE_API_URL', '')
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '')

    expect(resolvePublicConfig()).toEqual({
      apiBaseUrl: DEFAULT_API_BASE_URL,
      googleClientId: DEFAULT_GOOGLE_CLIENT_ID,
      authEnabled: true,
      authDisabledReason: null,
    })
  })

  it('убирает завершающие слэши и пробелы из URL', () => {
    vi.stubEnv('VITE_API_URL', '  https://api.example.com/api/v1///  ')
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', CUSTOM_CLIENT_ID)

    const config = resolvePublicConfig()
    expect(config.apiBaseUrl).toBe(CUSTOM_API_URL)
    expect(config.googleClientId).toBe(CUSTOM_CLIENT_ID)
    expect(config.authEnabled).toBe(true)
  })

  it('читает переменные лениво при каждом вызове', () => {
    vi.stubEnv('VITE_API_URL', CUSTOM_API_URL)
    expect(resolvePublicConfig().apiBaseUrl).toBe(CUSTOM_API_URL)

    vi.stubEnv('VITE_API_URL', OTHER_API_URL)
    expect(resolvePublicConfig().apiBaseUrl).toBe('https://other.example.com/v2')
  })

  it('отключает вход при невалидном URL', () => {
    vi.stubEnv('VITE_API_URL', 'not-a-url')
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', CUSTOM_CLIENT_ID)

    const config = resolvePublicConfig()
    expect(config.apiBaseUrl).toBe('')
    expect(config.googleClientId).toBe(CUSTOM_CLIENT_ID)
    expect(config.authEnabled).toBe(false)
    expect(config.authDisabledReason).toContain('VITE_API_URL')
  })

  it('отклоняет не-http(s) URL', () => {
    vi.stubEnv('VITE_API_URL', 'ftp://api.example.com/api/v1')

    const config = resolvePublicConfig()
    expect(config.authEnabled).toBe(false)
    expect(config.apiBaseUrl).toBe('')
    expect(config.authDisabledReason).toContain('http(s)')
  })

  it('отключает вход при невалидном Client ID', () => {
    vi.stubEnv('VITE_API_URL', CUSTOM_API_URL)
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'invalid-client-id')

    const config = resolvePublicConfig()
    expect(config.apiBaseUrl).toBe(CUSTOM_API_URL)
    expect(config.googleClientId).toBe('')
    expect(config.authEnabled).toBe(false)
    expect(config.authDisabledReason).toContain('VITE_GOOGLE_CLIENT_ID')
  })

  it('сообщает обо всех причинах отключения', () => {
    vi.stubEnv('VITE_API_URL', 'relative/path')
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'nope')

    const reason = resolvePublicConfig().authDisabledReason
    expect(reason).toContain('VITE_API_URL')
    expect(reason).toContain('VITE_GOOGLE_CLIENT_ID')
  })
})
