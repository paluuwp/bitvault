import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_TRACK_COLOR } from '../constants'
import { openDatabase } from '../db'
import { getFile, saveFile } from '../repositories/files'
import {
  createTrack,
  deleteTrack,
  getTrack,
  listTracks,
  recordPlay,
  toggleFavorite,
  updateTrack,
} from '../repositories/tracks'
import { captureAppErrorAsync, resetDatabase } from './helpers'

beforeEach(async () => {
  await resetDatabase()
})

describe('createTrack', () => {
  it('создаёт трек с нормализованными полями', async () => {
    const track = await createTrack({ name: '  My Beat  ' })
    expect(track.name).toBe('My Beat')
    expect(track.nameLower).toBe('my beat')
    expect(track.id).toBeTruthy()
    expect(track.color).toBe(DEFAULT_TRACK_COLOR)
    expect(track.bpm).toBeNull()
    expect(track.tags).toEqual([])
    expect(track.playCount).toBe(0)
    expect(track.lastPlayedAt).toBeNull()
    expect(track.createdAt).toBe(track.updatedAt)
  })

  it('отклоняет некорректный ввод', async () => {
    const error = await captureAppErrorAsync(() => createTrack({ name: '   ' }))
    expect(error.code).toBe('VALIDATION')
    expect(await listTracks()).toEqual([])
  })
})

describe('чтение и обновление', () => {
  it('возвращает трек по id', async () => {
    const track = await createTrack({ name: 'A' })
    expect(await getTrack(track.id)).toEqual(track)
    expect(await getTrack('missing')).toBeNull()
  })

  it('сортирует список от новых к старым', async () => {
    const first = await createTrack({ name: 'First' })
    const second = await createTrack({ name: 'Second' })
    const database = await openDatabase()
    await database.put('tracks', { ...first, createdAt: '2026-01-01T00:00:00.000Z' })
    await database.put('tracks', { ...second, createdAt: '2026-02-01T00:00:00.000Z' })

    const tracks = await listTracks()
    expect(tracks.map((track) => track.name)).toEqual(['Second', 'First'])
  })

  it('обновляет поля и nameLower', async () => {
    const track = await createTrack({ name: 'Old' })
    const updated = await updateTrack(track.id, { name: 'New', bpm: 140 })
    expect(updated.name).toBe('New')
    expect(updated.nameLower).toBe('new')
    expect(updated.bpm).toBe(140)
    expect(updated.createdAt).toBe(track.createdAt)
    expect(updated.updatedAt >= track.updatedAt).toBe(true)
  })

  it('не даёт обновить несуществующий трек', async () => {
    const error = await captureAppErrorAsync(() => updateTrack('missing', { name: 'X' }))
    expect(error.code).toBe('NOT_FOUND')
  })

  it('переключает избранное', async () => {
    const track = await createTrack({ name: 'A' })
    const favorite = await toggleFavorite(track.id)
    expect(favorite.isFavorite).toBe(true)
    const notFavorite = await toggleFavorite(track.id)
    expect(notFavorite.isFavorite).toBe(false)
  })

  it('учитывает прослушивания', async () => {
    const track = await createTrack({ name: 'A' })
    const firstPlay = await recordPlay(track.id)
    expect(firstPlay.playCount).toBe(1)
    expect(firstPlay.lastPlayedAt).not.toBeNull()

    const secondPlay = await recordPlay(track.id)
    expect(secondPlay.playCount).toBe(2)
  })
})

describe('deleteTrack', () => {
  it('удаляет трек', async () => {
    const track = await createTrack({ name: 'A' })
    await deleteTrack(track.id)
    expect(await getTrack(track.id)).toBeNull()
  })

  it('сообщает об отсутствующем треке', async () => {
    const error = await captureAppErrorAsync(() => deleteTrack('missing'))
    expect(error.code).toBe('NOT_FOUND')
  })

  it('удаляет аудиофайл вместе с треком', async () => {
    const audio = await saveFile(
      'audio',
      new Blob(['abc'], { type: 'audio/wav' }),
      'beat.wav',
      'audio/wav',
    )
    const track = await createTrack({ name: 'A', audioFileId: audio.id })

    await deleteTrack(track.id)
    expect(await getFile(audio.id)).toBeNull()
  })

  it('удаляет вложение вместе с треком', async () => {
    const attachment = await saveFile(
      'attachment',
      new Blob(['flp'], { type: 'application/octet-stream' }),
      'project.flp',
    )
    const track = await createTrack({ name: 'A', attachmentFileIds: [attachment.id] })

    await deleteTrack(track.id)
    expect(await getFile(attachment.id)).toBeNull()
  })

  it('не удаляет файл, на который ссылается другой трек', async () => {
    const audio = await saveFile(
      'audio',
      new Blob(['abc'], { type: 'audio/wav' }),
      'shared.wav',
      'audio/wav',
    )
    const first = await createTrack({ name: 'A', audioFileId: audio.id })
    const second = await createTrack({ name: 'B', audioFileId: audio.id })

    await deleteTrack(first.id)
    expect(await getFile(audio.id)).not.toBeNull()

    await deleteTrack(second.id)
    expect(await getFile(audio.id)).toBeNull()
  })
})
