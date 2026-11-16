export const SESSION_TOKEN_BYTES = 32
/** Срок сессии — 30 дней. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
/** expires_at продлевается не чаще раза в сутки. */
export const SESSION_TOUCH_INTERVAL_MS = 24 * 60 * 60 * 1000

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/
/** 32 байта в base64url без padding — ровно 43 символа. */
export const SESSION_TOKEN_LENGTH = 43

const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/** base64url без padding (без зависимости от btoa). */
export function toBase64Url(bytes: Uint8Array): string {
  let output = ''
  for (let index = 0; index < bytes.length; index += 3) {
    const byte0 = bytes[index] ?? 0
    const byte1 = bytes[index + 1]
    const byte2 = bytes[index + 2]

    output += BASE64URL_ALPHABET.charAt(byte0 >> 2)
    output += BASE64URL_ALPHABET.charAt(((byte0 & 0x03) << 4) | ((byte1 ?? 0) >> 4))
    if (byte1 !== undefined) {
      output += BASE64URL_ALPHABET.charAt(((byte1 & 0x0f) << 2) | ((byte2 ?? 0) >> 6))
    }
    if (byte2 !== undefined) {
      output += BASE64URL_ALPHABET.charAt(byte2 & 0x3f)
    }
  }
  return output
}

/** Случайный непрозрачный токен сессии: 32 байта → 43 символа base64url. */
export function generateSessionToken(): string {
  const bytes = new Uint8Array(SESSION_TOKEN_BYTES)
  crypto.getRandomValues(bytes)
  return toBase64Url(bytes)
}

export function isSessionToken(value: string): boolean {
  return value.length === SESSION_TOKEN_LENGTH && BASE64URL_PATTERN.test(value)
}

export function toHex(bytes: Uint8Array): string {
  let hex = ''
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0')
  return hex
}

/** В D1 хранится только SHA-256 хеш токена. */
export async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return toHex(new Uint8Array(digest))
}

/** Достаёт токен из заголовка `Authorization: Bearer <token>`. */
export function parseBearerToken(header: string | undefined): string | null {
  if (!header) return null
  const match = /^Bearer[ \t]+(\S+)$/i.exec(header.trim())
  const token = match?.[1]
  return token && isSessionToken(token) ? token : null
}
