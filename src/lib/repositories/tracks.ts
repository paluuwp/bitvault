import type { NewTrackInput, Track, TrackPatch } from '@/types/models'
import {
  deleteTrackFromCloud,
  getCloudContext,
  pushTrackToCloud,
  refreshCloudTracks,
} from '../cloud'
import { runWriteTransaction, withDatabase } from '../db'
import { AppError } from '../errors'
import { createId } from '../id'
import { normalizeNewTrack, normalizePatch } from '../validation'
import { collectTrackFileIds } from './files'

/** Новые треки сверху; при равной дате порядок стабилизируется по id. */
function sortTracks(tracks: Track[]): Track[] {
  return [...tracks].sort(
    (left, right) =>
      right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id),
  )
}

async function listLocalTracks(): Promise<Track[]> {
  return withDatabase(async (database) => {
    const tracks = await database.getAllFromIndex('tracks', 'by-created-at')
    return sortTracks(tracks)
  })
}

/**
 * Возвращает библиотеку устройства. В авторизованном состоянии сначала
 * подтягивает треки аккаунта (при сбое сети остаётся локальный кэш).
 */
export async function listTracks(): Promise<Track[]> {
  const context = getCloudContext()
  if (context) {
    try {
      await refreshCloudTracks(context)
    } catch (error) {
      console.warn('Не удалось обновить библиотеку аккаунта', error)
    }
  }
  return listLocalTracks()
}

export async function getTrack(id: string): Promise<Track | null> {
  return withDatabase(async (database) => (await database.get('tracks', id)) ?? null)
}

export async function createTrack(input: NewTrackInput): Promise<Track> {
  const normalized = normalizeNewTrack(input)
  const now = new Date().toISOString()
  const track: Track = {
    id: createId(),
    name: normalized.name,
    nameLower: normalized.name.toLowerCase(),
    bpm: normalized.bpm,
    musicalKey: normalized.musicalKey,
    genre: normalized.genre,
    tags: normalized.tags,
    notes: normalized.notes,
    color: normalized.color,
    audioFileId: normalized.audioFileId,
    coverFileId: normalized.coverFileId,
    attachmentFileIds: normalized.attachmentFileIds,
    isFavorite: normalized.isFavorite,
    durationSec: normalized.durationSec,
    createdAt: now,
    updatedAt: now,
    lastPlayedAt: null,
    playCount: 0,
  }
  await withDatabase(async (database) => {
    await database.put('tracks', track)
  })
  return track
}

export async function updateTrack(id: string, patch: TrackPatch): Promise<Track> {
  const normalized = normalizePatch(patch)
  const existing = await getTrack(id)
  if (!existing) throw new AppError('NOT_FOUND', 'Трек не найден.')

  const updated: Track = {
    ...existing,
    ...normalized,
    updatedAt: new Date().toISOString(),
  }
  if (normalized.name !== undefined) updated.nameLower = normalized.name.toLowerCase()

  const context = getCloudContext()
  const stored =
    context && existing.source === 'cloud'
      ? await pushTrackToCloud(context, updated)
      : updated

  await withDatabase(async (database) => {
    await database.put('tracks', stored)
  })
  return stored
}

/** Удаляет трек и его файлы, если на них больше не ссылается другой трек. */
export async function deleteTrack(id: string): Promise<void> {
  const existing = await getTrack(id)
  if (!existing) throw new AppError('NOT_FOUND', 'Трек не найден.')

  const context = getCloudContext()
  if (context && existing.source === 'cloud') {
    await deleteTrackFromCloud(context, id)
  }

  await withDatabase((database) =>
    runWriteTransaction(database, ['tracks', 'files'], async (transaction) => {
      const tracks = transaction.objectStore('tracks')
      const files = transaction.objectStore('files')

      await tracks.delete(id)
      const remaining = await tracks.getAll()
      const referenced = new Set<string>()
      for (const track of remaining) {
        for (const fileId of collectTrackFileIds(track)) referenced.add(fileId)
      }
      for (const fileId of collectTrackFileIds(existing)) {
        if (referenced.has(fileId)) continue
        const file = await files.get(fileId)
        if (file) await files.delete(fileId)
      }
    }),
  )
}

export async function toggleFavorite(id: string): Promise<Track> {
  const existing = await getTrack(id)
  if (!existing) throw new AppError('NOT_FOUND', 'Трек не найден.')

  const updated: Track = {
    ...existing,
    isFavorite: !existing.isFavorite,
    updatedAt: new Date().toISOString(),
  }

  const context = getCloudContext()
  const stored =
    context && existing.source === 'cloud'
      ? await pushTrackToCloud(context, updated)
      : updated

  await withDatabase(async (database) => {
    await database.put('tracks', stored)
  })
  return stored
}

export async function recordPlay(id: string): Promise<Track> {
  return withDatabase((database) =>
    runWriteTransaction(database, ['tracks'], async (transaction) => {
      const store = transaction.objectStore('tracks')
      const existing = await store.get(id)
      if (!existing) throw new AppError('NOT_FOUND', 'Трек не найден.')

      const now = new Date().toISOString()
      const updated: Track = {
        ...existing,
        playCount: existing.playCount + 1,
        lastPlayedAt: now,
        updatedAt: now,
      }
      await store.put(updated)
      return updated
    }),
  )
}
