/**
 * Типы ответов Worker API (`/api/v1`) и машинные коды ошибок.
 * Источник истины — docs/cloudflare-api.md.
 */

export const API_ERROR_CODES = [
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'EMAIL_NOT_ALLOWED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'RATE_LIMITED',
  'INTERNAL',
  'UNAVAILABLE',
] as const

export type ApiErrorCode = (typeof API_ERROR_CODES)[number]

export interface RemoteUser {
  id: string
  email: string
  name: string | null
  picture: string | null
}

export interface RemoteLibrary {
  id: string
  name: string
  /** Роль пользователя в библиотеке: owner и т. п. */
  role: string
}

export interface LoginResponse {
  token: string
  expiresAt: string
  user: RemoteUser
  libraries: RemoteLibrary[]
}

export interface MeResponse {
  user: RemoteUser
  libraries: RemoteLibrary[]
  /**
   * Актуальный серверный срок сессии. Необязателен: старые версии Worker
   * это поле не присылают.
   */
  expiresAt?: string
}
