import { beforeEach, describe, expect, it } from 'vitest'
import type { FileKind } from '@/types/models'
import { deleteFile, deleteFileIfOrphan, getFile, saveFile } from '../repositories/files'
import { createTrack, deleteTrack } from '../repositories/tracks'
import { captureAppErrorAsync, resetDatabase } from './helpers'

beforeEach(async () => {
  await resetDatabase()
})

describe('saveFile', () => {
  it('сохраняет метаданные файла', async () => {
    const blob = new Blob(['abc'], { type: 'audio/wav' })
    const file = await saveFile('audio', blob, '  Beat.WAV  ', 'audio/wav')
    expect(file.id).toBeTruthy()
    expect(file.kind).toBe('audio')
    expect(file.size).toBe(3)
    expect(file.mimeType).toBe('audio/wav')
    expect(file.originalName).toBe('Beat.WAV')
    expect(file.createdAt).toBeTruthy()
    const stored = await getFile(file.id)
    if (!stored) throw new Error('Файл не сохранён.')
    expect(stored).toMatchObject({
      id: file.id,
      kind: 'audio',
      mimeType: 'audio/wav',
      size: 3,
      originalName: 'Beat.WAV',
    })
    const bytes = new Uint8Array(await stored.blob.arrayBuffer())
    expect(Array.from(bytes)).toEqual([97, 98, 99])
  })

  it('берёт MIME из blob, если он не передан', async () => {
    const file = await saveFile('cover', new Blob(['x'], { type: 'image/png' }), 'cover.png')
    expect(file.mimeType).toBe('image/png')
  })

  it('отклоняет неизвестный тип файла', async () => {
    const error = await captureAppErrorAsync(() =>
      saveFile('bogus' as unknown as FileKind, new Blob(['x']), 'x.bin'),
    )
    expect(error.code).toBe('VALIDATION')
  })

  it('возвращает null для отсутствующего файла', async () => {
    expect(await getFile('missing')).toBeNull()
  })
})

describe('deleteFile', () => {
  it('удаляет файл', async () => {
    const file = await saveFile('cover', new Blob(['x']), 'cover.png')
    await deleteFile(file.id)
    expect(await getFile(file.id)).toBeNull()
  })
})

describe('deleteFileIfOrphan', () => {
  it('удаляет файл без ссылок', async () => {
    const file = await saveFile('cover', new Blob(['x']), 'cover.png')
    expect(await deleteFileIfOrphan(file.id)).toBe(true)
    expect(await getFile(file.id)).toBeNull()
  })

  it('не удаляет файл, на который ссылается трек', async () => {
    const audio = await saveFile('audio', new Blob(['abc']), 'beat.wav')
    const track = await createTrack({ name: 'A', audioFileId: audio.id })

    expect(await deleteFileIfOrphan(audio.id)).toBe(false)
    expect(await getFile(audio.id)).not.toBeNull()

    await deleteTrack(track.id)
    expect(await getFile(audio.id)).toBeNull()
  })

  it('не считает отсутствующий файл сиротой для удаления', async () => {
    expect(await deleteFileIfOrphan('missing')).toBe(false)
  })
})
