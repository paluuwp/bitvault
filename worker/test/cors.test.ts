import { describe, expect, it } from 'vitest'
import { DEFAULT_PUBLIC_ORIGINS, parseOrigins } from '../src/lib/cors'
import { createHarness } from './helpers'

const ALLOWED_ORIGIN = 'https://paluuwp.github.io'
const FOREIGN_ORIGIN = 'https://evil.example.com'

describe('CORS', () => {
  it('preflight разрешённого origin → 204 и точный ACAO', async () => {
    const harness = createHarness()
    const response = await harness.app.request(
      '/api/v1/auth/google',
      {
        method: 'OPTIONS',
        headers: {
          Origin: ALLOWED_ORIGIN,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'authorization, content-type',
        },
      },
      harness.env,
    )

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe(ALLOWED_ORIGIN)
    expect(response.headers.get('access-control-allow-methods')).toContain('POST')
    expect(response.headers.get('access-control-allow-headers')?.toLowerCase()).toContain(
      'authorization',
    )
    expect(response.headers.get('access-control-allow-headers')?.toLowerCase()).toContain(
      'content-type',
    )
    expect(response.headers.get('vary')?.toLowerCase()).toContain('origin')
  })

  it('preflight чужого origin → 204 без ACAO', async () => {
    const harness = createHarness()
    const response = await harness.app.request(
      '/api/v1/auth/google',
      {
        method: 'OPTIONS',
        headers: {
          Origin: FOREIGN_ORIGIN,
          'Access-Control-Request-Method': 'POST',
        },
      },
      harness.env,
    )

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('обычный ответ разрешённому origin содержит ACAO', async () => {
    const harness = createHarness()
    const response = await harness.app.request(
      '/api/v1/health',
      { headers: { Origin: ALLOWED_ORIGIN } },
      harness.env,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe(ALLOWED_ORIGIN)
    expect(response.headers.get('vary')?.toLowerCase()).toContain('origin')
  })

  it('обычный ответ чужому origin остаётся без ACAO', async () => {
    const harness = createHarness()
    const response = await harness.app.request(
      '/api/v1/health',
      { headers: { Origin: FOREIGN_ORIGIN } },
      harness.env,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('origin сравнивается точно, без учёта подстрок', async () => {
    const harness = createHarness()
    const response = await harness.app.request(
      '/api/v1/health',
      { headers: { Origin: 'https://Paluuwp.github.io' } },
      harness.env,
    )

    expect(response.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('второй origin из PUBLIC_ORIGINS тоже разрешён', async () => {
    const harness = createHarness()
    const response = await harness.app.request(
      '/api/v1/health',
      { headers: { Origin: 'http://localhost:5173' } },
      harness.env,
    )

    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
  })

  it('пустой PUBLIC_ORIGINS закрывает CORS (fail closed)', async () => {
    const harness = createHarness({ env: { PUBLIC_ORIGINS: '  ' } })
    const response = await harness.app.request(
      '/api/v1/health',
      { headers: { Origin: ALLOWED_ORIGIN } },
      harness.env,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
  })
})

describe('parseOrigins', () => {
  it('undefined → значения по умолчанию', () => {
    expect(parseOrigins(undefined)).toEqual([...DEFAULT_PUBLIC_ORIGINS])
  })

  it('явно пустое значение → пустой список', () => {
    expect(parseOrigins('')).toEqual([])
    expect(parseOrigins(' , , ')).toEqual([])
  })

  it('обрезает пробелы и отбрасывает пустые элементы', () => {
    expect(parseOrigins(' https://a.example , ,http://b.example ')).toEqual([
      'https://a.example',
      'http://b.example',
    ])
  })
})
