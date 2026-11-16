import { describe, expect, it } from 'vitest'
import { RemoteApiError } from '../api/errors'
import {
  describeRemoteApiError,
  messageForErrorCode,
  messageForFailure,
} from '../api/messages'

describe('messageForErrorCode', () => {
  it('объясняет запрет по списку доступа', () => {
    const message = messageForErrorCode('EMAIL_NOT_ALLOWED', 'login')
    expect(message).toContain('Этот аккаунт не разрешён')
    expect(message).toContain('список доступа')
  })

  it('советует подождать при ограничении частоты', () => {
    const message = messageForErrorCode('RATE_LIMITED', 'login')
    expect(message).toContain('Слишком много попыток входа')
    expect(message).toContain('Подождите около минуты и попробуйте снова')
  })

  it('сообщает о недоступности сервиса входа', () => {
    expect(messageForErrorCode('UNAVAILABLE', 'login')).toContain(
      'Сервис входа недоступен',
    )
  })

  it('учитывает контекст для истёкшей сессии', () => {
    expect(messageForErrorCode('UNAUTHORIZED', 'login')).toContain(
      'Не удалось подтвердить вход',
    )
    expect(messageForErrorCode('UNAUTHORIZED', 'refresh')).toContain('Сессия истекла')
    expect(messageForErrorCode('UNAUTHORIZED', 'logout')).toContain(
      'Сессия уже завершена',
    )
  })

  it('учитывает контекст для отклонённого запроса', () => {
    expect(messageForErrorCode('BAD_REQUEST', 'login')).toContain('запрос на вход')
    expect(messageForErrorCode('BAD_REQUEST', 'refresh')).toContain(
      'проверки сессии',
    )
    expect(messageForErrorCode('BAD_REQUEST', 'logout')).toContain('запрос на выход')
  })

  it('даёт запасной текст для неизвестного кода', () => {
    expect(messageForErrorCode(undefined, 'logout')).toContain('выйти')
    expect(messageForErrorCode(undefined, 'refresh')).toContain('проверить сессию')
    expect(messageForErrorCode(undefined, 'login')).toContain('войти')
  })

  it('переводит общие коды на русский', () => {
    expect(messageForErrorCode('FORBIDDEN', 'login')).toContain('Доступ')
    expect(messageForErrorCode('INTERNAL', 'login')).toContain('На сервере')
    expect(messageForErrorCode('PAYLOAD_TOO_LARGE', 'login')).toContain(
      'слишком большой',
    )
  })
})

describe('messageForFailure', () => {
  it('описывает сетевой сбой', () => {
    expect(messageForFailure('network')).toContain('Нет связи с сервером')
  })

  it('описывает таймаут', () => {
    expect(messageForFailure('timeout')).toContain('Сервер не ответил вовремя')
  })

  it('описывает неожиданный ответ', () => {
    expect(messageForFailure('parse')).toContain('Сервер вернул неожиданный ответ')
  })

  it('для http-сбоя использует код и контекст', () => {
    expect(messageForFailure('http', 'refresh', 'UNAUTHORIZED')).toContain(
      'Сессия истекла',
    )
    expect(messageForFailure('http', 'login', 'EMAIL_NOT_ALLOWED')).toContain(
      'Этот аккаунт не разрешён',
    )
  })
})

describe('describeRemoteApiError', () => {
  it('формирует текст по полям ошибки', () => {
    const error = new RemoteApiError('http', 'служебное сообщение', {
      code: 'RATE_LIMITED',
      status: 429,
    })
    expect(describeRemoteApiError(error, 'login')).toContain(
      'Слишком много попыток входа',
    )
  })

  it('не подставляет служебное сообщение ошибки', () => {
    const error = new RemoteApiError('parse', 'служебное сообщение')
    expect(describeRemoteApiError(error)).not.toContain('служебное сообщение')
    expect(describeRemoteApiError(error)).toContain('Сервер вернул неожиданный ответ')
  })
})
