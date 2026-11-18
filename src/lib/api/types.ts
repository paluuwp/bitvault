/**
 * Типы ответов Worker API (`/api/v1`) и машинные коды ошибок.
 * Источник истины — docs/cloudflare-api.md.
 */

export const API_ERROR_CODES = [
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'EMAIL_NOT_ALLOWED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'RATE_LIMITED',
  'INTERNAL',
  'UNAVAILABLE',
] as const

export type ApiErrorCode = (typeof API_ERROR_CODES)[number]

export interface RemoteUser {
  id: string
  email: string
  name: string | null
  picture: string | null
}

export interface RemoteLibrary {
  id: string
  name: string
  /** Роль пользователя в библиотеке: owner и т. п. */
  role: string
}

export interface LoginResponse {
  token: string
  expiresAt: string
  user: RemoteUser
  libraries: RemoteLibrary[]
}

export interface MeResponse {
  user: RemoteUser
  libraries: RemoteLibrary[]
  /**
   * Актуальный серверный срок сессии. Необязателен: старые версии Worker
   * это поле не присылают.
   */
  expiresAt?: string
}

/** Метаданные файла, хранящегося в аккаунте. */
export interface RemoteFile {
  id: string
  kind: 'audio' | 'cover' | 'attachment'
  name: string
  mimeType: string
  size: number
}

/** Трек библиотеки аккаунта в том виде, в каком его отдаёт Worker. */
export interface RemoteTrack {
  id: string
  name: string
  bpm: number | null
  musicalKey: string | null
  genre: string | null
  author: string | null
  tags: string[]
  notes: string
  color: string
  isFavorite: boolean
  durationSec: number | null
  createdAt: string
  updatedAt: string
  lastPlayedAt: string | null
  playCount: number
  audioFile: RemoteFile | null
  coverFile: RemoteFile | null
  attachments: RemoteFile[]
}

export interface RemoteTracksResponse {
  library: RemoteLibrary
  tracks: RemoteTrack[]
}

/** Тело PUT трека: идентификаторы файлов, уже загруженных в библиотеку. */
export interface RemoteTrackInput {
  name: string
  bpm: number | null
  musicalKey: string | null
  genre: string | null
  author: string | null
  tags: string[]
  notes: string
  color: string
  isFavorite: boolean
  durationSec: number | null
  createdAt: string
  updatedAt: string
  audioFileId: string | null
  coverFileId: string | null
  attachmentFileIds: string[]
}

export interface RemoteFileUrlResponse {
  url: string
  expiresAt: string
  file: RemoteFile
}
