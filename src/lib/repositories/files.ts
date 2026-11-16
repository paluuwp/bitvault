import type { FileKind, StoredFile, Track } from '@/types/models'
import { downloadCloudFile, getCloudContext, resolveCloudFile } from '../cloud'
import { runWriteTransaction, withDatabase } from '../db'
import { AppError } from '../errors'
import { createId } from '../id'

const FILE_KINDS: readonly FileKind[] = ['audio', 'cover', 'attachment']

export async function saveFile(
  kind: FileKind,
  blob: Blob,
  originalName: string,
  mimeType?: string,
): Promise<StoredFile> {
  if (!FILE_KINDS.includes(kind)) {
    throw new AppError('VALIDATION', 'Некорректный тип файла.')
  }
  const file: StoredFile = {
    id: createId(),
    kind,
    blob,
    mimeType: mimeType ?? blob.type,
    size: blob.size,
    originalName: originalName.trim() || 'file',
    createdAt: new Date().toISOString(),
  }
  await withDatabase(async (database) => {
    await database.put('files', file)
  })
  return file
}

/** Файл из локального кэша, без обращения к серверу. */
export async function getStoredFile(id: string): Promise<StoredFile | null> {
  return withDatabase(async (database) => (await database.get('files', id)) ?? null)
}

/**
 * Файл из локального кэша; в авторизованном состоянии недостающий файл
 * скачивается из аккаунта и кэшируется.
 */
export async function getFile(id: string): Promise<StoredFile | null> {
  const local = await getStoredFile(id)
  if (local) return local

  const context = getCloudContext()
  if (!context) return null
  return downloadCloudFile(context, id)
}

export interface FileInfo {
  id: string
  kind: FileKind
  name: string
  mimeType: string
  size: number
}

/**
 * Метаданные файла без скачивания содержимого.
 * Для облачного файла достаточно подписанной ссылки — сам файл не качается.
 */
export async function getFileInfo(id: string): Promise<FileInfo | null> {
  const local = await getStoredFile(id)
  if (local) {
    return {
      id: local.id,
      kind: local.kind,
      name: local.originalName,
      mimeType: local.mimeType,
      size: local.size,
    }
  }

  const context = getCloudContext()
  if (!context) return null
  try {
    const { file } = await resolveCloudFile(context, id)
    return { id, kind: file.kind, name: file.name, mimeType: file.mimeType, size: file.size }
  } catch {
    return null
  }
}

export async function deleteFile(id: string): Promise<void> {
  await withDatabase(async (database) => {
    await database.delete('files', id)
  })
}

export function isFileReferencedByTrack(
  track: Pick<Track, 'audioFileId' | 'coverFileId' | 'attachmentFileIds'>,
  fileId: string,
): boolean {
  return (
    track.audioFileId === fileId ||
    track.coverFileId === fileId ||
    track.attachmentFileIds.includes(fileId)
  )
}

export function collectTrackFileIds(
  track: Pick<Track, 'audioFileId' | 'coverFileId' | 'attachmentFileIds'>,
): string[] {
  const ids = new Set<string>()
  if (track.audioFileId) ids.add(track.audioFileId)
  if (track.coverFileId) ids.add(track.coverFileId)
  for (const fileId of track.attachmentFileIds) ids.add(fileId)
  return [...ids]
}

/** Удаляет файл, только если на него не ссылается ни один трек. */
export async function deleteFileIfOrphan(fileId: string): Promise<boolean> {
  return withDatabase((database) =>
    runWriteTransaction(database, ['tracks', 'files'], async (transaction) => {
      const files = transaction.objectStore('files')
      const file = await files.get(fileId)
      if (!file) return false

      const tracks = await transaction.objectStore('tracks').getAll()
      if (tracks.some((track) => isFileReferencedByTrack(track, fileId))) return false

      await files.delete(fileId)
      return true
    }),
  )
}
