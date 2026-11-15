import type { Track, TrackColor } from '@/types/models'
import { DEFAULT_TRACK_COLOR, LIMITS, TRACK_COLORS } from './constants'
import { AppError } from './errors'
import { getAudioDuration, isAudioFile } from './audio'
import { isSupportedImageFile, validateAttachmentFile, validateAudioFile } from './validation'
import { deleteFile, saveFile } from './repositories/files'
import { createTrack } from './repositories/tracks'

/** Детерминированный цвет по имени: одинаковые имена всегда получают один цвет. */
export function colorFromName(name: string): TrackColor {
  let hash = 0
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0
  }
  return TRACK_COLORS[hash % TRACK_COLORS.length] ?? DEFAULT_TRACK_COLOR
}

/** Имя трека из имени файла без расширения. */
export function trackNameFromFileName(fileName: string): string {
  const trimmed = fileName.trim()
  const dotIndex = trimmed.lastIndexOf('.')
  const base = dotIndex > 0 ? trimmed.slice(0, dotIndex) : trimmed
  const name = base.trim().slice(0, LIMITS.nameMax)
  return name || 'Без названия'
}

/**
 * Создаёт трек из перетащенного файла: аудио — с длительностью, прочие файлы —
 * как вложение. Обложки не создают трек (их привязывает интерфейс).
 */
export async function createTrackFromFile(file: File): Promise<Track> {
  const originalName = file.name.trim() || 'Без названия'
  const name = trackNameFromFileName(originalName)
  const color = colorFromName(name)

  if (isAudioFile(file)) {
    validateAudioFile(file)
    const saved = await saveFile('audio', file, originalName, file.type)
    try {
      const durationSec = await getAudioDuration(file)
      return await createTrack({ name, color, audioFileId: saved.id, durationSec })
    } catch (error) {
      await deleteFile(saved.id).catch(() => undefined)
      throw error
    }
  }

  if (isSupportedImageFile(file)) {
    throw new AppError(
      'VALIDATION',
      'Изображения добавляются как обложки треков, а не как отдельные треки.',
    )
  }

  validateAttachmentFile(file)
  const saved = await saveFile('attachment', file, originalName, file.type)
  try {
    return await createTrack({ name, color, attachmentFileIds: [saved.id] })
  } catch (error) {
    await deleteFile(saved.id).catch(() => undefined)
    throw error
  }
}
