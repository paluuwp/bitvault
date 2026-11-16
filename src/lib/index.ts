import type { FileUrlHandle } from '@/types/models'
import { getCloudContext, resolveCloudFile } from './cloud'
import { AppError } from './errors'
import { getStoredFile } from './repositories/files'

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
export { saveFile, getFile, getStoredFile, getFileInfo, deleteFileIfOrphan } from './repositories/files'
export type { FileInfo } from './repositories/files'
export {
  clearCloudCache,
  getCloudContext,
  isCloudActive,
  migrateTrackToCloud,
  pushTrackToCloud,
} from './cloud'
export type { CloudContext } from './cloud'
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
  const file = await getStoredFile(fileId)
  if (file) {
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

  // Файл есть только в аккаунте: отдаём подписанную ссылку и играем/показываем
  // прямо по ней, не выкачивая весь файл в память.
  const context = getCloudContext()
  if (context) {
    const { url } = await resolveCloudFile(context, fileId)
    return { url, revoke: () => undefined }
  }

  throw new AppError('NOT_FOUND', 'Файл не найден.')
}
