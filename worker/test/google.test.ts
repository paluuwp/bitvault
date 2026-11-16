import { beforeAll, describe, expect, it } from 'vitest'
import { SignJWT, createLocalJWKSet, errors as joseErrors, exportJWK, generateKeyPair } from 'jose'
import type { JWTPayload } from 'jose'
import { createTestEnv } from './helpers'
import { toIdentity, verifyGoogleIdToken } from '../src/lib/google'

type KeySet = ReturnType<typeof createLocalJWKSet>

const CLIENT_ID = 'test-client-id'
const PAYLOAD_EMAIL = 'owner@example.com'

type PrivateKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey']

interface SignOptions {
  issuer?: string
  audience?: string
  email?: string
  emailVerified?: boolean | string
  omitEmailVerified?: boolean
  omitExpiration?: boolean
  expiresAt?: number
}

async function createSigner(): Promise<{ privateKey: PrivateKey; keySet: KeySet }> {
  const pair = await generateKeyPair('RS256')
  const jwk = await exportJWK(pair.publicKey)
  jwk.kid = 'test-key'
  jwk.alg = 'RS256'
  return { privateKey: pair.privateKey, keySet: createLocalJWKSet({ keys: [jwk] }) }
}

async function signToken(privateKey: PrivateKey, options: SignOptions = {}): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000)
  const payload: JWTPayload = {
    email: options.email ?? PAYLOAD_EMAIL,
  }
  if (!options.omitEmailVerified) {
    payload.email_verified = options.emailVerified ?? true
  }

  const unsigned = new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key', typ: 'JWT' })
    .setIssuer(options.issuer ?? 'https://accounts.google.com')
    .setAudience(options.audience ?? CLIENT_ID)
    .setSubject('google-sub-test')
    .setIssuedAt(nowSec)
  if (!options.omitExpiration) {
    unsigned.setExpirationTime(options.expiresAt ?? nowSec + 3600)
  }
  return unsigned.sign(privateKey)
}

let privateKey!: PrivateKey
let keySet!: KeySet

beforeAll(async () => {
  const signer = await createSigner()
  privateKey = signer.privateKey
  keySet = signer.keySet
})

describe('verifyGoogleIdToken', () => {
  it('принимает корректный токен и возвращает sub/email', async () => {
    const token = await signToken(privateKey)
    const identity = await verifyGoogleIdToken(token, createTestEnv(), keySet)

    expect(identity).toEqual({ sub: 'google-sub-test', email: PAYLOAD_EMAIL })
  })

  it('принимает issuer accounts.google.com без схемы', async () => {
    const token = await signToken(privateKey, { issuer: 'accounts.google.com' })
    const identity = await verifyGoogleIdToken(token, createTestEnv(), keySet)
    expect(identity.sub).toBe('google-sub-test')
  })

  it('отклоняет email_verified=false → 401', async () => {
    const token = await signToken(privateKey, { emailVerified: false })
    await expect(verifyGoogleIdToken(token, createTestEnv(), keySet)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      status: 401,
    })
  })

  it('отклоняет отсутствующий email_verified → 401', async () => {
    const token = await signToken(privateKey, { omitEmailVerified: true })
    await expect(verifyGoogleIdToken(token, createTestEnv(), keySet)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })

  it('отклоняет чужой audience → 401', async () => {
    const token = await signToken(privateKey, { audience: 'another-client-id' })
    await expect(verifyGoogleIdToken(token, createTestEnv(), keySet)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })

  it('отклоняет чужой issuer → 401', async () => {
    const token = await signToken(privateKey, { issuer: 'https://evil.example.com' })
    await expect(verifyGoogleIdToken(token, createTestEnv(), keySet)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })

  it('отклоняет истёкший токен → 401', async () => {
    const token = await signToken(privateKey, {
      expiresAt: Math.floor(Date.now() / 1000) - 60,
    })
    await expect(verifyGoogleIdToken(token, createTestEnv(), keySet)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })

  it('отклоняет подпись чужим ключом → 401', async () => {
    const other = await createSigner()
    const token = await signToken(other.privateKey)
    await expect(verifyGoogleIdToken(token, createTestEnv(), keySet)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })

  it('без GOOGLE_CLIENT_ID → 503 UNAVAILABLE', async () => {
    const env = createTestEnv({ GOOGLE_CLIENT_ID: '' })
    await expect(verifyGoogleIdToken('any-credential', env)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
      status: 503,
    })
  })

  it('отклоняет токен без exp → 401', async () => {
    const token = await signToken(privateKey, { omitExpiration: true })
    await expect(verifyGoogleIdToken(token, createTestEnv(), keySet)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })

  it('сетевой сбой JWKS → 503, а не 401', async () => {
    const failingKeySet = (async () => {
      throw new TypeError('fetch failed')
    }) as unknown as KeySet
    const token = await signToken(privateKey)
    await expect(
      verifyGoogleIdToken(token, createTestEnv(), failingKeySet),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE', status: 503 })
  })

  it('таймаут JWKS (JWKSTimeout) → 503', async () => {
    const timeoutKeySet = (async () => {
      throw new joseErrors.JWKSTimeout()
    }) as unknown as KeySet
    const token = await signToken(privateKey)
    await expect(
      verifyGoogleIdToken(token, createTestEnv(), timeoutKeySet),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE', status: 503 })
  })

  it('не-200 от JWKS (JOSEError) → 503', async () => {
    const brokenKeySet = (async () => {
      throw new joseErrors.JOSEError(
        'Expected 200 OK from the JSON Web Key Set HTTP response',
      )
    }) as unknown as KeySet
    const token = await signToken(privateKey)
    await expect(
      verifyGoogleIdToken(token, createTestEnv(), brokenKeySet),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE', status: 503 })
  })
})

describe('toIdentity', () => {
  it('принимает email_verified строкой "true"', () => {
    const identity = toIdentity({ sub: 's1', email: 'a@b.com', email_verified: 'true' })
    expect(identity).toEqual({ sub: 's1', email: 'a@b.com' })
  })

  it('отклоняет отсутствующий sub', () => {
    expect(() => toIdentity({ email: 'a@b.com', email_verified: true })).toThrowError(
      /subject/i,
    )
  })

  it('отклоняет отсутствующий e-mail', () => {
    expect(() => toIdentity({ sub: 's1', email_verified: true })).toThrowError(/e-mail/i)
  })

  it('отклоняет e-mail без подтверждения', () => {
    expect(() => toIdentity({ sub: 's1', email: 'a@b.com', email_verified: false })).toThrowError(
      /подтверждён/i,
    )
  })
})
