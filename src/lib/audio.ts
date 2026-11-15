import { AUDIO_EXTENSIONS, AUDIO_MIME_TYPES } from './constants'

const DURATION_TIMEOUT_MS = 10_000

export interface AudioFileInfo {
  name: string
  type: string
}

/** Расширение файла в нижнем регистре без точки. Для `.flp` и файлов без точки — пустая строка. */
export function getFileExtension(name: string): string {
  const normalized = name.trim()
  const dotIndex = normalized.lastIndexOf('.')
  if (dotIndex <= 0 || dotIndex === normalized.length - 1) return ''
  return normalized.slice(dotIndex + 1).toLowerCase()
}

export function normalizeMimeType(mimeType: string): string {
  const [base] = mimeType.split(';')
  return (base ?? '').trim().toLowerCase()
}

export function isSupportedAudioMime(mimeType: string): boolean {
  return AUDIO_MIME_TYPES.includes(normalizeMimeType(mimeType))
}

export function isSupportedAudioExtension(extension: string): boolean {
  return AUDIO_EXTENSIONS.includes(extension.trim().toLowerCase())
}

/** Аудио определяется по MIME-типу или расширению (MIME может быть пустым или обобщённым). */
export function isAudioFile(file: AudioFileInfo): boolean {
  return isSupportedAudioMime(file.type) || isSupportedAudioExtension(getFileExtension(file.name))
}

/**
 * Длительность аудио через `HTMLAudioElement`.
 * Возвращает `null`, если API недоступен, файл не читается или истёк таймаут.
 */
export function getAudioDuration(file: Blob): Promise<number | null> {
  if (
    typeof Audio === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return Promise.resolve(null)
  }

  return new Promise<number | null>((resolve) => {
    let objectUrl: string | null = null
    let settled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const finish = (value: number | null): void => {
      if (settled) return
      settled = true
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      if (objectUrl !== null) {
        URL.revokeObjectURL(objectUrl)
        objectUrl = null
      }
      resolve(value)
    }

    try {
      objectUrl = URL.createObjectURL(file)
    } catch {
      resolve(null)
      return
    }

    const audio = new Audio()
    audio.preload = 'metadata'
    audio.addEventListener('loadedmetadata', () => {
      const duration = audio.duration
      finish(Number.isFinite(duration) && duration > 0 ? duration : null)
    })
    audio.addEventListener('error', () => finish(null))
    timer = setTimeout(() => finish(null), DURATION_TIMEOUT_MS)

    try {
      audio.src = objectUrl
      audio.load()
    } catch {
      finish(null)
    }
  })
}
