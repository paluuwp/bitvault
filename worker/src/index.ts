import { Hono } from 'hono'
import type { AppEnv, Env } from './env'
import { D1Store } from './db/d1'
import type { Store } from './db/store'
import { corsMiddleware } from './lib/cors'
import { errorEnvelope, jsonResponseWithCors, toApiError } from './lib/errors'
import { verifyGoogleIdToken } from './lib/google'
import type { VerifyIdToken } from './lib/google'
import { authRoutes } from './routes/auth'
import { healthRoutes } from './routes/health'

const BASE_PATH = '/api/v1'

export interface AppDeps {
  /** Подмена хранилища в тестах; по умолчанию D1Store. */
  storeFactory?: (env: Env) => Store
  /** Подмена верификатора Google ID-токена; по умолчанию JWKS Google. */
  verifyIdToken?: VerifyIdToken
  /** Подмена часов для детерминированных тестов. */
  now?: () => Date
}

export function createApp(deps: AppDeps = {}) {
  const storeFactory = deps.storeFactory ?? ((env: Env) => new D1Store(env.DB))
  const verifyIdToken = deps.verifyIdToken ?? verifyGoogleIdToken
  const now = deps.now ?? (() => new Date())

  const app = new Hono<AppEnv>().basePath(BASE_PATH)

  app.use('*', corsMiddleware())
  app.route('/health', healthRoutes())
  app.route('/auth', authRoutes({ storeFactory, verifyIdToken, now }))

  app.notFound((c) =>
    jsonResponseWithCors(
      errorEnvelope('NOT_FOUND', 'Маршрут не найден.'),
      404,
      c.req.header('Origin') ?? null,
      c.env,
    ),
  )

  app.onError((error, c) => {
    const apiError = toApiError(error)
    if (apiError.status >= 500) {
      // Не логируем токены, credential и e-mail — только код и класс ошибки.
      const name = error instanceof Error ? error.name : 'UnknownError'
      console.error(`[api] ${apiError.code} ${name}`)
    }
    return jsonResponseWithCors(
      errorEnvelope(apiError.code, apiError.message),
      apiError.status,
      c.req.header('Origin') ?? null,
      c.env,
    )
  })

  return app
}

const app = createApp()

export default app
