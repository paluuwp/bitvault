import type { RemoteApiError, RemoteApiFailure } from './errors'
import type { ApiErrorCode } from './types'

/** Контекст запроса, для которого подбирается пользовательский текст. */
export type AuthMessageContext = 'login' | 'refresh' | 'logout' | 'library'

const CONTEXT_ACTION: Record<AuthMessageContext, string> = {
  login: 'войти',
  refresh: 'проверить сессию',
  logout: 'выйти',
  library: 'загрузить библиотеку',
}

const BAD_REQUEST_MESSAGES: Record<AuthMessageContext, string> = {
  login: 'Сервер отклонил запрос на вход. Проверьте данные и попробуйте снова.',
  refresh: 'Сервер отклонил запрос проверки сессии.',
  logout: 'Сервер отклонил запрос на выход.',
  library: 'Сервер отклонил запрос библиотеки. Проверьте данные трека.',
}

const UNAUTHORIZED_MESSAGES: Record<AuthMessageContext, string> = {
  login: 'Не удалось подтвердить вход. Попробуйте войти снова.',
  refresh: 'Сессия истекла. Войдите снова.',
  logout: 'Сессия уже завершена.',
  library: 'Сессия истекла. Войдите снова, чтобы открыть библиотеку аккаунта.',
}

const CODE_MESSAGES: Record<ApiErrorCode, string> = {
  BAD_REQUEST: 'Сервер отклонил запрос. Проверьте данные и попробуйте снова.',
  UNAUTHORIZED: 'Не удалось подтвердить сессию. Войдите снова.',
  EMAIL_NOT_ALLOWED:
    'Этот аккаунт не разрешён. Попросите добавить ваш e-mail в список доступа.',
  FORBIDDEN: 'Доступ к этому действию запрещён.',
  NOT_FOUND: 'Запрошенный ресурс не найден на сервере.',
  CONFLICT: 'Сервер сообщил о конфликте данных. Попробуйте снова.',
  PAYLOAD_TOO_LARGE: 'Запрос слишком большой для сервера.',
  RATE_LIMITED: 'Слишком много попыток входа. Подождите около минуты и попробуйте снова.',
  INTERNAL: 'На сервере произошла ошибка. Попробуйте позже.',
  UNAVAILABLE: 'Сервис входа недоступен. Попробуйте позже.',
}

/** Текст по коду ошибки API с учётом контекста запроса. */
export function messageForErrorCode(
  code: ApiErrorCode | undefined,
  context: AuthMessageContext = 'login',
): string {
  if (!code) {
    return `Не удалось ${CONTEXT_ACTION[context]}. Попробуйте снова.`
  }
  if (code === 'UNAUTHORIZED') return UNAUTHORIZED_MESSAGES[context]
  if (code === 'BAD_REQUEST') return BAD_REQUEST_MESSAGES[context]
  return CODE_MESSAGES[code]
}

/** Текст по классу сбоя; для HTTP-ошибки дополнительно нужен код. */
export function messageForFailure(
  failure: RemoteApiFailure,
  context: AuthMessageContext = 'login',
  code?: ApiErrorCode,
): string {
  switch (failure) {
    case 'network':
      return 'Нет связи с сервером. Проверьте подключение к интернету и попробуйте снова.'
    case 'timeout':
      return 'Сервер не ответил вовремя. Попробуйте снова.'
    case 'parse':
      return 'Сервер вернул неожиданный ответ. Попробуйте позже.'
    case 'http':
      return messageForErrorCode(code, context)
  }
}

/** Готовый пользовательский текст для ошибки клиента API. */
export function describeRemoteApiError(
  error: RemoteApiError,
  context: AuthMessageContext = 'login',
): string {
  return messageForFailure(error.failure, context, error.code)
}
