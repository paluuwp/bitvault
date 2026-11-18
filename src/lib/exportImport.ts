import { unzip, zip, type AsyncZippable, type Unzipped, type UnzipFileInfo } from 'fflate'
import type { ImportResult, StoredFile, Track, TransferProgress } from '@/types/models'
import { FILES_DIR, LIMITS, MANIFEST_ENTRY } from './constants'
import { downloadCloudFile, getCloudContext, resolveCloudFile } from './cloud'
import { openDatabase, runWriteTransaction } from './db'
import { AppError, toAppError } from './errors'
import { formatBytes } from './format'
import { createId } from './id'
import { collectTrackFileIds } from './repositories/files'
import {
  buildManifest,
  fileArchivePath,
  isSafeArchivePath,
  parseManifest,
  type ExportManifest,
  type ManifestFile,
} from './manifest'
import { normalizeImportedTrackMetadata } from './validation'

export interface ImportOptions {
  mode: 'merge' | 'replace'
  /** Вызывается непосредственно перед записью в хранилище, после проверки архива. */
  onBeforeWrite?: () => void
}

type ProgressListener = (progress: TransferProgress) => void

function reportProgress(listener: ProgressListener | undefined, progress: TransferProgress): void {
  if (!listener) return
  try {
    listener(progress)
  } catch {
    // Слушатель прогресса не должен прерывать экспорт или импорт.
  }
}

function zipArchive(entries: AsyncZippable): Promise<Uint8Array<ArrayBuffer>> {
  return new Promise((resolve, reject) => {
    zip(entries, (error, data) => {
      if (error) {
        reject(error)
        return
      }
      resolve(data)
    })
  })
}

function unzipArchive(
  data: Uint8Array,
  filter?: (file: UnzipFileInfo) => boolean,
): Promise<Unzipped> {
  return new Promise((resolve, reject) => {
    const callback = (error: unknown, result: Unzipped) => {
      if (error) {
        reject(error)
        return
      }
      resolve(result)
    }

    if (filter) {
      unzip(data, { filter }, callback)
    } else {
      unzip(data, callback)
    }
  })
}

/** Имя файла экспорта: `bitvault-export-YYYY-MM-DD.zip`. */
export function exportFileName(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `bitvault-export-${year}-${month}-${day}.zip`
}

/** Экспорт обязан оставаться импортируемым: те же лимиты, что и при импорте. */
export function assertLibraryExportable(trackCount: number, files: StoredFile[]): void {
  if (trackCount > LIMITS.importTracksMax) {
    throw new AppError(
      'EXPORT_FAILED',
      `В библиотеке больше ${LIMITS.importTracksMax} треков — такой архив не удастся импортировать.`,
    )
  }
  if (files.length > LIMITS.importFilesMax) {
    throw new AppError(
      'EXPORT_FAILED',
      `В библиотеке больше ${LIMITS.importFilesMax} файлов — такой архив не удастся импортировать.`,
    )
  }
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0)
  if (totalBytes > LIMITS.importTotalMaxBytes) {
    throw new AppError(
      'EXPORT_FAILED',
      `Файлы библиотеки занимают ${formatBytes(totalBytes)}, а один архив поддерживает до ${formatBytes(LIMITS.importTotalMaxBytes)}. Удалите часть файлов, чтобы сделать резервную копию.`,
    )
  }
}

/**
 * Докачивает файлы облачных треков, которых ещё нет на устройстве.
 *
 * Экспорт обязан быть полной резервной копией: без этого шага в архив попали
 * бы треки с ссылками на файлы, которых в архиве нет.
 */
async function cacheAccountFiles(
  tracks: Track[],
  onProgress?: ProgressListener,
): Promise<void> {
  const context = getCloudContext()
  if (!context) return

  const database = await openDatabase()
  const cached = await database.getAll('files')
  const cachedIds = new Set(cached.map((file) => file.id))
  const missing: string[] = []
  for (const track of tracks) {
    if (track.source !== 'cloud') continue
    for (const fileId of collectTrackFileIds(track)) {
      if (!cachedIds.has(fileId) && !missing.includes(fileId)) missing.push(fileId)
    }
  }
  if (missing.length === 0) return

  // Размеры и лимиты проверяем до скачивания, чтобы не тянуть лишнее.
  let extraBytes = 0
  for (const fileId of missing) {
    try {
      const { file } = await resolveCloudFile(context, fileId)
      extraBytes += file.size
    } catch (error) {
      throw toAppError(error)
    }
  }

  if (cached.length + missing.length > LIMITS.importFilesMax) {
    throw new AppError(
      'EXPORT_FAILED',
      `В библиотеке больше ${LIMITS.importFilesMax} файлов — такой архив не удастся импортировать.`,
    )
  }
  const totalBytes = cached.reduce((sum, file) => sum + file.size, 0) + extraBytes
  if (totalBytes > LIMITS.importTotalMaxBytes) {
    throw new AppError(
      'EXPORT_FAILED',
      `Файлы библиотеки занимают ${formatBytes(totalBytes)}, а один архив поддерживает до ${formatBytes(LIMITS.importTotalMaxBytes)}. Удалите часть файлов, чтобы сделать резервную копию.`,
    )
  }

  for (let index = 0; index < missing.length; index += 1) {
    const fileId = missing[index]
    if (!fileId) continue
    reportProgress(onProgress, {
      phase: 'prepare',
      current: index,
      total: missing.length,
      label: 'Загрузка файлов аккаунта…',
    })
    try {
      await downloadCloudFile(context, fileId)
    } catch (error) {
      throw toAppError(error)
    }
  }
}

export async function exportLibrary(onProgress?: ProgressListener): Promise<Blob> {
  try {
    const database = await openDatabase()
    const tracks = await database.getAll('tracks')
    await cacheAccountFiles(tracks, onProgress)
    const files = await database.getAll('files')
    assertLibraryExportable(tracks.length, files)
    const total = files.length

    reportProgress(onProgress, {
      phase: 'prepare',
      current: 0,
      total,
      label: 'Подготовка архива…',
    })

    const manifest = buildManifest(tracks, files)
    const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2))
    const archive: AsyncZippable = { [MANIFEST_ENTRY]: [manifestBytes, { level: 6 }] }

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index]
      const bytes = new Uint8Array(await file.blob.arrayBuffer())
      archive[fileArchivePath(file)] = [bytes, { level: 0 }]
      reportProgress(onProgress, {
        phase: 'read',
        current: index + 1,
        total,
        label: `Чтение «${file.originalName}»`,
      })
    }

    reportProgress(onProgress, {
      phase: 'write',
      current: 0,
      total,
      label: 'Создание архива…',
    })
    const zipped = await zipArchive(archive)
    reportProgress(onProgress, {
      phase: 'finish',
      current: total,
      total,
      label: 'Экспорт завершён',
    })
    return new Blob([zipped], { type: 'application/zip' })
  } catch (error) {
    throw toAppError(error, 'EXPORT_FAILED')
  }
}

function hasZipSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b
}

async function readArchive(blob: Blob): Promise<Uint8Array<ArrayBuffer>> {
  if (blob.size > LIMITS.importArchiveMaxBytes) {
    throw new AppError(
      'IMPORT_LIMIT_EXCEEDED',
      `Архив больше ${formatBytes(LIMITS.importArchiveMaxBytes)}.`,
    )
  }
  try {
    return new Uint8Array(await blob.arrayBuffer())
  } catch (error) {
    throw new AppError('IMPORT_CORRUPT_ZIP', 'Не удалось прочитать архив.', { cause: error })
  }
}

/**
 * Распаковывает архив с ограничениями: записи вне каталога files, небезопасные
 * имена и файлы сверх лимита не распаковываются вовсе. Размер берётся из
 * заголовка ZIP до выделения памяти, поэтому архив-бомба не разворачивается.
 */
async function extractArchive(bytes: Uint8Array<ArrayBuffer>): Promise<Unzipped> {
  if (!hasZipSignature(bytes)) {
    throw new AppError('IMPORT_CORRUPT_ZIP')
  }

  let remaining = LIMITS.importTotalMaxBytes
  let limitExceeded = false
  let acceptedEntries = 0

  const filter = (file: UnzipFileInfo): boolean => {
    // Для stored-записей originalSize обязан совпадать с size: иначе распаковщик
    // скопирует больше байт, чем учтено в бюджете (амплификация памяти).
    const isStored = file.compression === 0
    if (isStored && file.originalSize !== file.size) {
      limitExceeded = true
      return false
    }
    const cost = Math.max(file.originalSize, file.size)

    if (file.name === MANIFEST_ENTRY) {
      if (cost > LIMITS.importManifestMaxBytes) {
        limitExceeded = true
        return false
      }
      return true
    }
    if (!file.name.startsWith(`${FILES_DIR}/`) || !isSafeArchivePath(file.name)) {
      return false
    }
    if (acceptedEntries >= LIMITS.importFilesMax) {
      limitExceeded = true
      return false
    }
    if (cost > remaining) {
      limitExceeded = true
      return false
    }
    remaining -= cost
    acceptedEntries += 1
    return true
  }

  try {
    const entries = await unzipArchive(bytes, filter)
    if (limitExceeded) {
      throw new AppError(
        'IMPORT_LIMIT_EXCEEDED',
        `Распакованный размер архива превышает ${formatBytes(LIMITS.importTotalMaxBytes)}.`,
      )
    }
    return entries
  } catch (error) {
    if (error instanceof AppError) throw error
    throw new AppError('IMPORT_CORRUPT_ZIP', undefined, { cause: error })
  }
}

function readManifestFromArchive(entries: Unzipped): ExportManifest {
  const manifestBytes = entries[MANIFEST_ENTRY]
  if (!manifestBytes) {
    throw new AppError('IMPORT_INVALID_MANIFEST', 'В архиве отсутствует manifest.json.')
  }
  let json: string
  try {
    json = new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes)
  } catch (error) {
    throw new AppError('IMPORT_INVALID_MANIFEST', 'Не удалось прочитать manifest.json.', {
      cause: error,
    })
  }
  return parseManifest(json)
}

function makeStoredFile(definition: ManifestFile, bytes: Uint8Array<ArrayBuffer>): StoredFile {
  return {
    id: definition.id,
    kind: definition.kind,
    blob: new Blob([bytes], { type: definition.mimeType || 'application/octet-stream' }),
    mimeType: definition.mimeType,
    size: bytes.byteLength,
    originalName: definition.originalName,
    createdAt: definition.createdAt,
  }
}

function resolveReferencedFile(
  fileId: string | null,
  preparedFiles: Map<string, StoredFile>,
  manifestFileIds: Set<string>,
  trackName: string,
  label: string,
  warnings: string[],
): string | null {
  if (!fileId) return null
  if (preparedFiles.has(fileId)) return fileId
  if (!manifestFileIds.has(fileId)) {
    warnings.push(`У трека «${trackName}» отсутствует ${label}.`)
  }
  return null
}

export async function importLibrary(
  blob: Blob,
  options: ImportOptions,
  onProgress?: ProgressListener,
): Promise<ImportResult> {
  const mode = options && options.mode
  if (mode !== 'merge' && mode !== 'replace') {
    throw new AppError('VALIDATION', 'Некорректный режим импорта.')
  }
  const notifyBeforeWrite =
    options && typeof options.onBeforeWrite === 'function' ? options.onBeforeWrite : undefined

  const result: ImportResult = {
    tracksImported: 0,
    tracksSkipped: 0,
    filesImported: 0,
    errors: [],
    warnings: [],
  }
  reportProgress(onProgress, {
    phase: 'prepare',
    current: 0,
    total: 1,
    label: 'Подготовка импорта…',
  })

  const archiveBytes = await readArchive(blob)
  reportProgress(onProgress, {
    phase: 'read',
    current: 1,
    total: 1,
    label: 'Архив прочитан',
  })

  const entries = await extractArchive(archiveBytes)
  const manifest = readManifestFromArchive(entries)

  let existingTrackIds = new Set<string>()
  if (mode === 'merge') {
    const database = await openDatabase()
    existingTrackIds = new Set((await database.getAllKeys('tracks')).map((key) => String(key)))
  }

  const preparedFiles = new Map<string, StoredFile>()
  const manifestFileIds = new Set<string>()
  let actualTotal = 0
  for (const definition of manifest.files) {
    manifestFileIds.add(definition.id)
    const bytes = entries[definition.path]
    if (!bytes) {
      result.warnings.push(`Файл «${definition.originalName}» отсутствует в архиве.`)
      continue
    }

    const perFileLimit =
      definition.kind === 'audio'
        ? LIMITS.audioFileMaxBytes
        : definition.kind === 'cover'
          ? LIMITS.coverFileMaxBytes
          : LIMITS.attachmentFileMaxBytes
    if (bytes.byteLength > perFileLimit) {
      throw new AppError(
        'IMPORT_LIMIT_EXCEEDED',
        `Файл «${definition.originalName}» больше ${formatBytes(perFileLimit)}.`,
      )
    }
    actualTotal += bytes.byteLength
    if (actualTotal > LIMITS.importTotalMaxBytes) {
      throw new AppError(
        'IMPORT_LIMIT_EXCEEDED',
        `Размер файлов в архиве превышает ${formatBytes(LIMITS.importTotalMaxBytes)}.`,
      )
    }
    // Заявленный в манифесте размер не используется: доверяем только байтам архива.
    if (definition.size !== bytes.byteLength) {
      result.warnings.push(
        `Размер файла «${definition.originalName}» в манифесте не совпадает с содержимым архива.`,
      )
    }
    preparedFiles.set(definition.id, makeStoredFile(definition, bytes))
  }

  const preparedTracks: Track[] = []
  for (const manifestTrack of manifest.tracks) {
    const normalized = normalizeImportedTrackMetadata(manifestTrack)
    result.warnings.push(...normalized.warnings)
    const metadata = normalized.track

    if (mode === 'merge' && metadata.id && existingTrackIds.has(metadata.id)) {
      result.tracksSkipped += 1
      continue
    }

    const audioFileId = resolveReferencedFile(
      metadata.audioFileId,
      preparedFiles,
      manifestFileIds,
      metadata.name,
      'аудиофайл',
      result.warnings,
    )
    const coverFileId = resolveReferencedFile(
      metadata.coverFileId,
      preparedFiles,
      manifestFileIds,
      metadata.name,
      'обложка',
      result.warnings,
    )

    const attachmentFileIds: string[] = []
    let danglingAttachment = false
    for (const fileId of metadata.attachmentFileIds) {
      if (preparedFiles.has(fileId)) {
        attachmentFileIds.push(fileId)
      } else if (!manifestFileIds.has(fileId)) {
        danglingAttachment = true
      }
    }
    if (danglingAttachment) {
      result.warnings.push(`У трека «${metadata.name}» отсутствуют вложения.`)
    }

    preparedTracks.push({
      id: metadata.id ?? createId(),
      name: metadata.name,
      nameLower: metadata.name.toLowerCase(),
      bpm: metadata.bpm,
      musicalKey: metadata.musicalKey,
      author: metadata.author,
      genre: metadata.genre,
      tags: metadata.tags,
      notes: metadata.notes,
      color: metadata.color,
      audioFileId,
      coverFileId,
      attachmentFileIds,
      isFavorite: metadata.isFavorite,
      durationSec: metadata.durationSec,
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
      lastPlayedAt: metadata.lastPlayedAt,
      playCount: metadata.playCount,
    })
  }

  const database = await openDatabase()
  const total = preparedTracks.length

  try {
    if (mode === 'replace') {
      // Плеер останавливается только здесь: архив уже прочитан, проверен и готов к записи.
      notifyBeforeWrite?.()
      await runWriteTransaction(database, ['tracks', 'files'], async (transaction) => {
        await transaction.objectStore('tracks').clear()
        await transaction.objectStore('files').clear()

        const referenced = new Set<string>()
        for (const track of preparedTracks) {
          for (const fileId of collectTrackFileIds(track)) referenced.add(fileId)
        }
        for (const fileId of referenced) {
          const file = preparedFiles.get(fileId)
          if (!file) continue
          await transaction.objectStore('files').put(file)
          result.filesImported += 1
        }

        for (let index = 0; index < preparedTracks.length; index += 1) {
          await transaction.objectStore('tracks').put(preparedTracks[index])
          result.tracksImported += 1
          reportProgress(onProgress, {
            phase: 'write',
            current: index + 1,
            total,
            label: `Запись трека ${index + 1} из ${total}`,
          })
        }
      })
    } else {
      await runWriteTransaction(database, ['tracks', 'files'], async (transaction) => {
        const trackStore = transaction.objectStore('tracks')
        const fileStore = transaction.objectStore('files')
        const filesToWrite = new Set<string>()

        for (let index = 0; index < preparedTracks.length; index += 1) {
          const track = preparedTracks[index]
          if (await trackStore.get(track.id)) {
            result.tracksSkipped += 1
            continue
          }
          for (const fileId of collectTrackFileIds(track)) {
            if (!preparedFiles.has(fileId)) continue
            if (!(await fileStore.get(fileId))) filesToWrite.add(fileId)
          }
          await trackStore.put(track)
          result.tracksImported += 1
          reportProgress(onProgress, {
            phase: 'write',
            current: index + 1,
            total,
            label: `Запись трека ${index + 1} из ${total}`,
          })
        }

        for (const fileId of filesToWrite) {
          const file = preparedFiles.get(fileId)
          if (!file) continue
          await fileStore.put(file)
          result.filesImported += 1
        }
      })
    }
  } catch (error) {
    throw toAppError(error)
  }

  reportProgress(onProgress, {
    phase: 'finish',
    current: total,
    total,
    label: 'Импорт завершён',
  })
  return result
}
