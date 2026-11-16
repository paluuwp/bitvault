/**
 * Публичная конфигурация клиента.
 *
 * В клиентскую сборку попадают только публичные значения: адрес Worker API и
 * Google Client ID. Секреты (ALLOWED_EMAILS, MEDIA_TOKEN_SECRET и т. п.)
 * живут исключительно в Worker.
 */

export const DEFAULT_API_BASE_URL =
  'https://bitvault-api.bitvault-api.workers.dev/api/v1'

export const DEFAULT_GOOGLE_CLIENT_ID =
  '634934544232-e3fg2l93h7gmpmnvcbkngktj1a4u36pj.apps.googleusercontent.com'

const GOOGLE_CLIENT_ID_PATTERN = /^[\w-]+\.apps\.googleusercontent\.com$/

export interface PublicConfig {
  /** Абсолютный базовый URL API без завершающего слэша; '' при ошибке. */
  apiBaseUrl: string
  /** Публичный Google Client ID; '' при ошибке. */
  googleClientId: string
  /** Можно ли показывать вход через Google. */
  authEnabled: boolean
  /** Причина отключения входа; null, если конфигурация корректна. */
  authDisabledReason: string | null
}

/**
 * Проверяет и нормализует базовый URL API.
 * Возвращает URL без завершающих слэшей либо null, если значение невалидно.
 */
function normalizeApiBaseUrl(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const normalized = trimmed.replace(/\/+$/, '')
  if (!normalized) return null

  let parsed: URL
  try {
    parsed = new URL(normalized)
  } catch {
    return null
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  if (!parsed.hostname) return null
  return normalized
}

/** Проверяет публичный Google Client ID и возвращает его без пробелов либо null. */
function normalizeGoogleClientId(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed || !GOOGLE_CLIENT_ID_PATTERN.test(trimmed)) return null
  return trimmed
}

/**
 * Читает публичную конфигурацию из `import.meta.env` при каждом вызове.
 *
 * Ленивое чтение важно для тестов (`vi.stubEnv`) и позволяет переопределять
 * значения без повторной загрузки модуля.
 */
export function resolvePublicConfig(): PublicConfig {
  const rawApiUrl = import.meta.env.VITE_API_URL
  const rawClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID

  // Пустая или отсутствующая переменная означает «использовать дефолт».
  const apiBaseUrl = normalizeApiBaseUrl(
    typeof rawApiUrl === 'string' && rawApiUrl.trim() ? rawApiUrl : DEFAULT_API_BASE_URL,
  )
  const googleClientId = normalizeGoogleClientId(
    typeof rawClientId === 'string' && rawClientId.trim()
      ? rawClientId
      : DEFAULT_GOOGLE_CLIENT_ID,
  )

  const reasons: string[] = []
  if (!apiBaseUrl) {
    reasons.push('Некорректный VITE_API_URL: нужен абсолютный http(s)-URL.')
  }
  if (!googleClientId) {
    reasons.push(
      'Некорректный VITE_GOOGLE_CLIENT_ID: ожидается Client ID вида *.apps.googleusercontent.com.',
    )
  }

  return {
    apiBaseUrl: apiBaseUrl ?? '',
    googleClientId: googleClientId ?? '',
    authEnabled: reasons.length === 0,
    authDisabledReason: reasons.length > 0 ? reasons.join(' ') : null,
  }
}
