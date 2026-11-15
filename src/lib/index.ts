import type { FileUrlHandle } from '@/types/models'
import { AppError } from './errors'
import { getFile } from './repositories/files'

export { openDatabase } from './db'
export {
  listTracks,
  getTrack,
  createTrack,
  updateTrack,
  deleteTrack,
  toggleFavorite,
  recordPlay,
} from './repositories/tracks'
export { saveFile, getFile, deleteFileIfOrphan } from './repositories/files'
export { createTrackFromFile } from './upload'
export { getStorageInfo, requestPersistence } from './storage'
export { exportLibrary, importLibrary } from './exportImport'
export { AppError, isAppError, toAppError } from './errors'
export type { AppErrorCode } from './errors'
export { validateCoverFile } from './validation'
export {
  LIMITS,
  TRACK_COLORS,
  DEFAULT_TRACK_COLOR,
  MUSICAL_KEYS,
  AUDIO_MIME_TYPES,
  AUDIO_EXTENSIONS,
  IMAGE_MIME_TYPES,
  IMAGE_EXTENSIONS,
  STORAGE_KEYS,
} from './constants'
export type * from '@/types/models'

/** Создаёт object URL для файла; вызывающая сторона обязана вызвать `revoke`. */
export async function getFileUrl(fileId: string): Promise<FileUrlHandle> {
  const file = await getFile(fileId)
  if (!file) throw new AppError('NOT_FOUND', 'Файл не найден.')

  const url = URL.createObjectURL(file.blob)
  let revoked = false
  return {
    url,
    revoke: () => {
      if (revoked) return
      revoked = true
      URL.revokeObjectURL(url)
    },
  }
}
