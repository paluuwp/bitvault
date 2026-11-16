import { API_ERROR_CODES, type ApiErrorCode } from './types'

export type RemoteApiFailure = 'http' | 'network' | 'timeout' | 'parse'

export interface RemoteApiErrorOptions {
  code?: ApiErrorCode
  status?: number
  cause?: unknown
}

/**
 * Ошибка клиента Worker API.
 *
 * `failure` описывает класс сбоя, `code` — код из конверта ошибки сервера
 * (или маппинг HTTP-статуса), `status` — HTTP-статус для `failure: 'http'`.
 * Сообщение всегда формируется на клиенте и не содержит токенов, credential
 * или тела запроса.
 */
export class RemoteApiError extends Error {
  readonly failure: RemoteApiFailure
  readonly code?: ApiErrorCode
  readonly status?: number

  constructor(failure: RemoteApiFailure, message: string, options: RemoteApiErrorOptions = {}) {
    const cause = options.cause
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'RemoteApiError'
    this.failure = failure
    this.code = options.code
    this.status = options.status
  }
}

export function isRemoteApiError(value: unknown): value is RemoteApiError {
  return value instanceof RemoteApiError
}

const STATUS_TO_CODE: Readonly<Record<number, ApiErrorCode>> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  429: 'RATE_LIMITED',
  503: 'UNAVAILABLE',
}

/** Маппинг HTTP-статуса на код ошибки, если сервер не прислал конверт. */
export function errorCodeFromStatus(status: number): ApiErrorCode | undefined {
  const mapped = STATUS_TO_CODE[status]
  if (mapped) return mapped
  if (status >= 500 && status <= 599) return 'INTERNAL'
  return undefined
}

/** Проверяет, что значение — допустимый код ошибки API. */
export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return (
    typeof value === 'string' && (API_ERROR_CODES as readonly string[]).includes(value)
  )
}
