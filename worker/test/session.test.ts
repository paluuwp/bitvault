import { describe, expect, it } from 'vitest'
import {
  SESSION_TOKEN_BYTES,
  generateSessionToken,
  hashSessionToken,
  isSessionToken,
  parseBearerToken,
} from '../src/lib/session'

describe('session token', () => {
  it('32 случайных байта дают 43 символа base64url', () => {
    const token = generateSessionToken()
    expect(token).toHaveLength(43)
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(isSessionToken(token)).toBe(true)
    expect(SESSION_TOKEN_BYTES).toBe(32)
  })

  it('токены не повторяются', () => {
    const tokens = new Set<string>()
    for (let index = 0; index < 200; index += 1) {
      tokens.add(generateSessionToken())
    }
    expect(tokens.size).toBe(200)
  })

  it('isSessionToken принимает только 43 символа base64url', () => {
    const token = generateSessionToken()
    expect(isSessionToken(token.slice(0, 42))).toBe(false)
    expect(isSessionToken(`${token}A`)).toBe(false)
    expect(isSessionToken('A'.repeat(43))).toBe(true)
    expect(isSessionToken('A'.repeat(43) + '*')).toBe(false)
  })

  it('SHA-256 хеш стабилен, 64 hex-символа и не содержит токен', async () => {
    const token = generateSessionToken()
    const first = await hashSessionToken(token)
    const second = await hashSessionToken(token)

    expect(first).toBe(second)
    expect(first).toMatch(/^[0-9a-f]{64}$/)
    expect(first).not.toContain(token)
  })

  it('разные токены дают разные хеши', async () => {
    const first = await hashSessionToken(generateSessionToken())
    const second = await hashSessionToken(generateSessionToken())
    expect(first).not.toBe(second)
  })
})

describe('parseBearerToken', () => {
  it('извлекает токен из Bearer-заголовка', () => {
    const token = generateSessionToken()
    expect(parseBearerToken(`Bearer ${token}`)).toBe(token)
    expect(parseBearerToken(`bearer ${token}`)).toBe(token)
  })

  it('отклоняет пустой и невалидный заголовок', () => {
    expect(parseBearerToken(undefined)).toBeNull()
    expect(parseBearerToken('Bearer')).toBeNull()
    expect(parseBearerToken('Bearer    ')).toBeNull()
    expect(parseBearerToken('Basic abc')).toBeNull()
    expect(parseBearerToken('Bearer not*valid')).toBeNull()
  })
})
