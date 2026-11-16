import { toHex } from './session'

/** Время жизни подписанной ссылки на медиа — 1 час. */
export const MEDIA_URL_TTL_SEC = 3600

const SIGNATURE_PATTERN = /^[0-9a-f]{64}$/i
const encoder = new TextEncoder()

/**
 * HMAC-SHA256 секретом MEDIA_TOKEN_SECRET от строки `<fileId>|<exp>`, hex.
 * exp — unix-секунды; подпись не привязана к пользователю, но и не даёт
 * доступа к другим файлам.
 */
export async function signMediaToken(
  secret: string,
  fileId: string,
  expiresAtSec: number,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${fileId}|${expiresAtSec}`),
  )
  return toHex(new Uint8Array(signature))
}

/** Сравнение подписей без раннего выхода (длина hex публична). */
export function signaturesMatch(expected: string, received: string): boolean {
  if (expected.length !== received.length) return false
  let diff = 0
  for (let index = 0; index < expected.length; index += 1) {
    diff |= expected.charCodeAt(index) ^ received.charCodeAt(index)
  }
  return diff === 0
}

export async function verifyMediaToken(
  secret: string,
  fileId: string,
  expiresAtSec: number,
  signature: string,
): Promise<boolean> {
  if (!SIGNATURE_PATTERN.test(signature)) return false
  const expected = await signMediaToken(secret, fileId, expiresAtSec)
  return signaturesMatch(expected, signature.toLowerCase())
}

export function isMediaSignature(value: string): boolean {
  return SIGNATURE_PATTERN.test(value)
}
