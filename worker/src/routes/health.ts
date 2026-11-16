import { Hono } from 'hono'
import type { AppEnv } from '../env'

export function healthRoutes(): Hono<AppEnv> {
  const router = new Hono<AppEnv>()
  router.get('/', (c) => c.json({ ok: true, version: '1' }))

  // Readiness: liveness выше не трогает D1, здесь — дешёвая проверка binding.
  router.get('/ready', async (c) => {
    try {
      await c.env.DB.prepare('SELECT 1').first()
      return c.json({ ok: true })
    } catch {
      return c.json({ ok: false }, 503)
    }
  })

  return router
}
