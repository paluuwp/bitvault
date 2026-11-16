import { createRemoteJWKSet, errors as joseErrors, jwtVerify } from 'jose'
import type { JWTVerifyGetKey, JWTPayload } from 'jose'
import type { Env } from '../env'
import { ApiError } from './errors'

type KeySet = JWTVerifyGetKey

export interface Identity {
  sub: string
  email: string
  name?: string
  picture?: string
}

/** Верификатор ID-токена; подменяется в тестах через createApp({ verifyIdToken }). */
export type VerifyIdToken = (credential: string, env: Env) => Promise<Identity>

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs'
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com']
/** Коды jose, означающие сбой получения/разбора JWKS, а не плохой токен. */
const JWKS_UNAVAILABLE_CODES = new Set<string>([
  'ERR_JOSE_GENERIC',
  'ERR_JWKS_TIMEOUT',
  'ERR_JWKS_INVALID',
])

let remoteJwks: KeySet | null = null

function getRemoteJwks(): KeySet {
  if (!remoteJwks) remoteJwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL))
  return remoteJwks
}

function readString(payload: JWTPayload, key: string): string | undefined {
  const value = payload[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** Проверяет обязательные claims Google ID-токена и приводит их к Identity. */
export function toIdentity(payload: JWTPayload): Identity {
  const sub = typeof payload.sub === 'string' ? payload.sub : ''
  const email = readString(payload, 'email')
  const emailVerified = payload.email_verified

  if (!sub) throw new ApiError('UNAUTHORIZED', 'Google-токен не содержит subject.')
  if (!email) throw new ApiError('UNAUTHORIZED', 'Google-токен не содержит e-mail.')
  if (emailVerified !== true && emailVerified !== 'true') {
    throw new ApiError('UNAUTHORIZED', 'E-mail в Google-токене не подтверждён.')
  }

  const identity: Identity = { sub, email }
  const name = readString(payload, 'name')
  const picture = readString(payload, 'picture')
  if (name) identity.name = name
  if (picture) identity.picture = picture
  return identity
}

/**
 * Проверяет Google ID-токен по JWKS: подпись, iss, aud, exp, email_verified.
 * keySet нужен только для офлайн-тестов; по умолчанию используется JWKS Google.
 */
export async function verifyGoogleIdToken(
  credential: string,
  env: Env,
  keySet?: KeySet,
): Promise<Identity> {
  const clientId = env.GOOGLE_CLIENT_ID?.trim()
  if (!clientId) {
    throw new ApiError('UNAVAILABLE', 'Вход через Google не настроен.')
  }

  try {
    const { payload } = await jwtVerify(credential, keySet ?? getRemoteJwks(), {
      issuer: GOOGLE_ISSUERS,
      audience: clientId,
      requiredClaims: ['exp', 'iat', 'sub', 'aud', 'iss'],
    })
    return toIdentity(payload)
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (error instanceof joseErrors.JOSEError) {
      // Таймаут/битый ответ JWKS — сбой зависимости, а не неверный токен.
      if (JWKS_UNAVAILABLE_CODES.has(error.code)) {
        throw new ApiError('UNAVAILABLE', 'Не удалось получить ключи Google.')
      }
      // Ошибки подписи/claims — это неверный токен (401).
      throw new ApiError('UNAUTHORIZED', 'Не удалось проверить Google-токен.')
    }
    // Сетевой сбой/недоступность JWKS — инфраструктурная ошибка (503).
    throw new ApiError('UNAVAILABLE', 'Не удалось получить ключи Google.')
  }
}
