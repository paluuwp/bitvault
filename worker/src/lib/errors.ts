import { HTTPException } from 'hono/http-exception'
import type { Env } from '../env'
import { appendVary, matchOrigin, parseOrigins } from './cors'

/** Коды ошибок из контракта docs/cloudflare-api.md. */
export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'EMAIL_NOT_ALLOWED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'INTERNAL'
  | 'UNAVAILABLE'

export const API_ERROR_STATUS: Record<ApiErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  EMAIL_NOT_ALLOWED: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  UNAVAILABLE: 503,
}

const DEFAULT_MESSAGES: Record<ApiErrorCode, string> = {
  BAD_REQUEST: 'Некорректный запрос.',
  UNAUTHORIZED: 'Требуется авторизация.',
  EMAIL_NOT_ALLOWED: 'Этот e-mail не входит в список разрешённых.',
  FORBIDDEN: 'Доступ запрещён.',
  NOT_FOUND: 'Не найдено.',
  CONFLICT: 'Конфликт данных.',
  PAYLOAD_TOO_LARGE: 'Слишком большой запрос.',
  RATE_LIMITED: 'Слишком много запросов.',
  INTERNAL: 'Внутренняя ошибка сервера.',
  UNAVAILABLE: 'Сервис временно недоступен.',
}

const STATUS_CODES: Record<number, ApiErrorCode> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  429: 'RATE_LIMITED',
  503: 'UNAVAILABLE',
}

/** Единый конверт ошибки: { error: { code, message } }. */
export interface ErrorEnvelope {
  error: {
    code: ApiErrorCode
    message: string
  }
}

export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly status: number

  constructor(code: ApiErrorCode, message?: string) {
    super(message ?? DEFAULT_MESSAGES[code])
    this.name = 'ApiError'
    this.code = code
    this.status = API_ERROR_STATUS[code]
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError
}

export function errorEnvelope(code: ApiErrorCode, message?: string): ErrorEnvelope {
  return { error: { code, message: message ?? DEFAULT_MESSAGES[code] } }
}

/** Приводит неизвестную ошибку к ApiError, не раскрывая детали наружу. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (error instanceof HTTPException) {
    const code = STATUS_CODES[error.status]
    if (code) return new ApiError(code)
    return new ApiError(error.status >= 500 ? 'INTERNAL' : 'BAD_REQUEST')
  }
  return new ApiError('INTERNAL')
}

/**
 * JSON-ответ с CORS-заголовками. Нужен для notFound/onError, где ответ
 * формируется в обход обычной цепочки middleware.
 */
export function jsonResponseWithCors(
  payload: unknown,
  status: number,
  origin: string | null,
  env: Pick<Env, 'PUBLIC_ORIGINS'>,
): Response {
  const allowedOrigin = matchOrigin(origin, parseOrigins(env.PUBLIC_ORIGINS))
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    // Ошибки авторизации не должны попадать в кэш промежуточных прокси.
    'Cache-Control': 'no-store',
  })
  appendVary(headers, 'Origin')
  if (allowedOrigin) {
    headers.set('Access-Control-Allow-Origin', allowedOrigin)
  }
  return new Response(JSON.stringify(payload), { status, headers })
}
