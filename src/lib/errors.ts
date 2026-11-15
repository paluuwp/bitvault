export type AppErrorCode =
  | 'VALIDATION'
  | 'UNSUPPORTED_AUDIO'
  | 'UNSUPPORTED_IMAGE'
  | 'FILE_TOO_LARGE'
  | 'NOT_FOUND'
  | 'DB_UNAVAILABLE'
  | 'DB_VERSION_UNSUPPORTED'
  | 'QUOTA_EXCEEDED'
  | 'IMPORT_INVALID_MANIFEST'
  | 'IMPORT_VERSION_UNSUPPORTED'
  | 'IMPORT_CORRUPT_ZIP'
  | 'IMPORT_LIMIT_EXCEEDED'
  | 'EXPORT_FAILED'

const DEFAULT_MESSAGES: Record<AppErrorCode, string> = {
  VALIDATION: 'Проверьте введённые данные.',
  UNSUPPORTED_AUDIO: 'Неподдерживаемый формат аудиофайла.',
  UNSUPPORTED_IMAGE: 'Неподдерживаемый формат изображения.',
  FILE_TOO_LARGE: 'Файл слишком большой.',
  NOT_FOUND: 'Запись не найдена.',
  DB_UNAVAILABLE: 'Не удалось открыть локальное хранилище.',
  DB_VERSION_UNSUPPORTED: 'Версия локальной базы данных не поддерживается.',
  QUOTA_EXCEEDED: 'Недостаточно места в локальном хранилище.',
  IMPORT_INVALID_MANIFEST: 'Некорректный файл манифеста.',
  IMPORT_VERSION_UNSUPPORTED: 'Версия импортируемого архива не поддерживается.',
  IMPORT_CORRUPT_ZIP: 'Архив повреждён или имеет неверный формат.',
  IMPORT_LIMIT_EXCEEDED: 'Превышены ограничения импорта.',
  EXPORT_FAILED: 'Не удалось создать архив экспорта.',
}

export interface AppErrorOptions {
  cause?: unknown
}

/** Ошибка приложения с машиночитаемым кодом и русским сообщением для пользователя. */
export class AppError extends Error {
  readonly code: AppErrorCode

  constructor(code: AppErrorCode, message?: string, options?: AppErrorOptions) {
    const cause = options?.cause
    super(message ?? DEFAULT_MESSAGES[code], cause === undefined ? undefined : { cause })
    this.name = 'AppError'
    this.code = code
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError
}

function readErrorName(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null
  const name = (error as { name?: unknown }).name
  return typeof name === 'string' ? name : null
}

/** Безопасно приводит неизвестную ошибку к AppError. */
export function toAppError(error: unknown, fallbackCode: AppErrorCode = 'DB_UNAVAILABLE'): AppError {
  if (error instanceof AppError) return error

  const name = readErrorName(error)
  if (name === 'QuotaExceededError') {
    return new AppError('QUOTA_EXCEEDED', undefined, { cause: error })
  }
  if (name === 'VersionError') {
    return new AppError('DB_VERSION_UNSUPPORTED', undefined, { cause: error })
  }
  return new AppError(fallbackCode, undefined, { cause: error })
}
