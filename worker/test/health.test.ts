import { describe, expect, it } from 'vitest'
import { createHarness, readJson } from './helpers'

describe('GET /api/v1/health', () => {
  it('отвечает 200 с ok и version', async () => {
    const harness = createHarness()
    const response = await harness.app.request('/api/v1/health', undefined, harness.env)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')

    const body = await readJson<{ ok: boolean; version: string }>(response)
    expect(body).toEqual({ ok: true, version: '1' })
  })

  it('не требует авторизации', async () => {
    const harness = createHarness()
    const response = await harness.app.request('/api/v1/health', undefined, harness.env)
    expect(response.status).toBe(200)
  })
})

describe('GET /api/v1/health/ready', () => {
  it('отвечает 200, когда D1 доступна', async () => {
    const db = {
      prepare: () => ({ first: async () => 1 }),
    } as unknown as D1Database
    const harness = createHarness({ env: { DB: db } })
    const response = await harness.app.request('/api/v1/health/ready', undefined, harness.env)

    expect(response.status).toBe(200)
    expect(await readJson<{ ok: boolean }>(response)).toEqual({ ok: true })
  })

  it('отвечает 503, когда D1 недоступна', async () => {
    const harness = createHarness()
    const response = await harness.app.request('/api/v1/health/ready', undefined, harness.env)

    expect(response.status).toBe(503)
    expect(await readJson<{ ok: boolean }>(response)).toEqual({ ok: false })
  })

  it('отвечает 503, когда запрос к D1 падает', async () => {
    const db = {
      prepare: () => ({
        first: async () => {
          throw new Error('D1 error')
        },
      }),
    } as unknown as D1Database
    const harness = createHarness({ env: { DB: db } })
    const response = await harness.app.request('/api/v1/health/ready', undefined, harness.env)

    expect(response.status).toBe(503)
    expect(await readJson<{ ok: boolean }>(response)).toEqual({ ok: false })
  })
})
