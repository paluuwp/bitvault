/** Bindings и переменные окружения Worker. */
export interface Env {
  /** D1-база данных (binding DB). */
  DB: D1Database
  /** Приватный R2-бакет (binding BUCKET). */
  BUCKET: R2Bucket
  /** Разрешённые origin через запятую; сравнение точное. */
  PUBLIC_ORIGINS?: string
  /** Google OAuth Client ID — audience ID-токена (не секрет). */
  GOOGLE_CLIENT_ID?: string
  /** Белый список e-mail через запятую. Пустой список запрещает вход всем. */
  ALLOWED_EMAILS?: string
  /** Секрет HMAC для подписанных ссылок на медиа; без него `/media/*` → 503. */
  MEDIA_TOKEN_SECRET?: string
}

/** Значения, которые middleware складывает в context Hono. */
export interface AppVariables {
  userId: string
  sessionId: string
  /** Актуальный срок сессии (ISO): с учётом продления, если оно произошло. */
  sessionExpiresAt: string
}

/** Тип окружения Hono: bindings + variables. */
export type AppEnv = {
  Bindings: Env
  Variables: AppVariables
}
