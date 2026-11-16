import { describe, expect, it } from 'vitest'
import { HTTPException } from 'hono/http-exception'
import { ApiError, toApiError } from '../src/lib/errors'
import { createHarness, readJson } from './helpers'
import type { ErrorBody } from './helpers'

const ALLOWED_ORIGIN = 'https://paluuwp.github.io'
const FOREIGN_ORIGIN = 'https://evil.example.com'

describe('JSON-конверт ошибок', () => {
  it('неизвестный маршрут → 404 NOT_FOUND', async () => {
    const harness = createHarness()
    const response = await harness.app.request('/api/v1/unknown', undefined, harness.env)

    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toContain('application/json')
    const body = await readJson<ErrorBody>(response)
    expect(body.error.code).toBe('NOT_FOUND')
    expect(typeof body.error.message).toBe('string')
  })

  it('404 разрешённому origin содержит ACAO', async () => {
    const harness = createHarness()
    const response = await harness.app.request(
      '/api/v1/unknown',
      { headers: { Origin: ALLOWED_ORIGIN } },
      harness.env,
    )

    expect(response.status).toBe(404)
    expect(response.headers.get('access-control-allow-origin')).toBe(ALLOWED_ORIGIN)
  })

  it('404 чужому origin без ACAO', async () => {
    const harness = createHarness()
    const response = await harness.app.request(
      '/api/v1/unknown',
      { headers: { Origin: FOREIGN_ORIGIN } },
      harness.env,
    )

    expect(response.status).toBe(404)
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('toApiError не раскрывает детали внутренней ошибки', () => {
    const apiError = toApiError(new Error('secret internals'))
    expect(apiError).toBeInstanceOf(ApiError)
    expect(apiError.code).toBe('INTERNAL')
    expect(apiError.status).toBe(500)
    expect(apiError.message).not.toContain('secret')
  })

  it('toApiError сохраняет ApiError как есть', () => {
    const source = new ApiError('UNAUTHORIZED')
    expect(toApiError(source)).toBe(source)
  })

  it('toApiError переводит HTTPException в код контракта', () => {
    expect(toApiError(new HTTPException(413)).code).toBe('PAYLOAD_TOO_LARGE')
    expect(toApiError(new HTTPException(429)).code).toBe('RATE_LIMITED')
    expect(toApiError(new HTTPException(418)).code).toBe('BAD_REQUEST')
    expect(toApiError(new HTTPException(502)).code).toBe('INTERNAL')
  })
})
