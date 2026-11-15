import { unzip, zip, type Unzipped } from 'fflate'
import { beforeEach, describe, expect, it } from 'vitest'
import type { StoredFile } from '@/types/models'
import { LIMITS } from '../constants'
import { assertLibraryExportable, exportFileName, exportLibrary, importLibrary } from '../exportImport'
import { parseManifest } from '../manifest'
import { createTrack, getTrack, listTracks } from '../repositories/tracks'
import { getFile, saveFile } from '../repositories/files'
import { captureAppError, captureAppErrorAsync, resetDatabase } from './helpers'

function zipFiles(
  files: Record<string, Uint8Array>,
  level: 0 | 6 = 6,
): Promise<Uint8Array<ArrayBuffer>> {
  return new Promise((resolve, reject) => {
    zip(files, { level }, (error, data) => {
      if (error) {
        reject(error)
        return
      }
      resolve(data)
    })
  })
}

/**
 * Подменяет заявленный размер записи в центральном каталоге ZIP — так выглядит
 * подделанный архив, который обещает распаковать больше, чем реально занимает.
 */
function patchUncompressedSize(
  data: Uint8Array<ArrayBuffer>,
  entryName: string,
  newSize: number,
): Uint8Array<ArrayBuffer> {
  const bytes = data.slice()
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let eocd = -1
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('EOCD не найден')

  const count = view.getUint16(eocd + 10, true)
  let offset = view.getUint32(eocd + 16, true)
  const wanted = new TextEncoder().encode(entryName)
  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('Битый каталог ZIP')
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const localOffset = view.getUint32(offset + 42, true)
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength)
    if (name.length === wanted.length && name.every((byte, index) => byte === wanted[index])) {
      view.setUint32(offset + 24, newSize, true)
      view.setUint32(localOffset + 22, newSize, true)
      return bytes
    }
    offset += 46 + nameLength + extraLength + commentLength
  }
  throw new Error(`Запись «${entryName}» не найдена`)
}

function unzipBytes(data: Uint8Array): Promise<Unzipped> {
  return new Promise((resolve, reject) => {
    unzip(data, (error, result) => {
      if (error) {
        reject(error)
        return
      }
      resolve(result)
    })
  })
}

function toBlob(bytes: Uint8Array<ArrayBuffer>): Blob {
  return new Blob([bytes], { type: 'application/zip' })
}

function encode(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

function makeManifestTrack(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 't1',
    name: 'No file',
    bpm: null,
    musicalKey: null,
    genre: null,
    tags: [],
    notes: '',
    color: '#D8FF3E',
    audioFileId: 'f1',
    coverFileId: null,
    attachmentFileIds: [],
    isFavorite: false,
    durationSec: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastPlayedAt: null,
    playCount: 0,
    ...overrides,
  }
}

function makeManifestFile(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'f1',
    kind: 'audio',
    path: 'files/f1.wav',
    mimeType: 'audio/wav',
    size: 10,
    originalName: 'missing.wav',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

async function seedLibrary() {
  const audio = await saveFile(
    'audio',
    new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/wav' }),
    'kick.wav',
    'audio/wav',
  )
  const cover = await saveFile(
    'cover',
    new Blob([new Uint8Array([9, 9])], { type: 'image/png' }),
    'cover.png',
    'image/png',
  )
  const attachment = await saveFile(
    'attachment',
    new Blob([new Uint8Array([7])], { type: 'application/octet-stream' }),
    'project.flp',
    'application/octet-stream',
  )
  const track = await createTrack({
    name: 'My Beat',
    bpm: 140,
    musicalKey: 'Am',
    genre: 'trap',
    tags: ['dark'],
    notes: 'note',
    color: '#8B5CF6',
    audioFileId: audio.id,
    coverFileId: cover.id,
    attachmentFileIds: [attachment.id],
    durationSec: 12.5,
  })
  return { audio, cover, attachment, track }
}

beforeEach(async () => {
  await resetDatabase()
})

describe('exportLibrary', () => {
  it('создаёт ZIP с манифестом и файлами', async () => {
    const seeded = await seedLibrary()
    const phases: string[] = []
    const archive = await exportLibrary((progress) => phases.push(progress.phase))

    expect(archive.type).toBe('application/zip')
    expect(archive.size).toBeGreaterThan(0)
    expect(phases).toContain('prepare')
    expect(phases).toContain('finish')

    const entries = await unzipBytes(new Uint8Array(await archive.arrayBuffer()))
    expect(Object.keys(entries)).toEqual(
      expect.arrayContaining([
        'manifest.json',
        `files/${seeded.audio.id}.wav`,
        `files/${seeded.cover.id}.png`,
        `files/${seeded.attachment.id}.flp`,
      ]),
    )

    const manifest = parseManifest(new TextDecoder().decode(entries['manifest.json']))
    expect(manifest.tracks).toHaveLength(1)
    expect(manifest.files).toHaveLength(3)
  })

  it('формирует имя файла экспорта', () => {
    expect(exportFileName(new Date(2026, 10, 15))).toBe('bitvault-export-2026-11-15.zip')
  })

  it('не создаёт архив, который не удастся импортировать', () => {
    const makeStored = (id: string, size: number): StoredFile => ({
      id,
      kind: 'audio',
      blob: new Blob([]),
      mimeType: 'audio/wav',
      size,
      originalName: 'beat.wav',
      createdAt: '2026-01-01T00:00:00.000Z',
    })

    expect(() => assertLibraryExportable(1, [makeStored('f1', 10)])).not.toThrow()

    expect(
      captureAppError(() => assertLibraryExportable(LIMITS.importTracksMax + 1, [])).code,
    ).toBe('EXPORT_FAILED')

    const manyFiles = Array.from({ length: LIMITS.importFilesMax + 1 }, (_, index) =>
      makeStored(`f${index}`, 0),
    )
    expect(captureAppError(() => assertLibraryExportable(1, manyFiles)).code).toBe('EXPORT_FAILED')

    expect(
      captureAppError(() =>
        assertLibraryExportable(1, [makeStored('f1', LIMITS.importTotalMaxBytes + 1)]),
      ).code,
    ).toBe('EXPORT_FAILED')
  })
})

describe('importLibrary: merge', () => {
  it('восстанавливает библиотеку после экспорта', async () => {
    const seeded = await seedLibrary()
    const archive = await exportLibrary()
    await resetDatabase()

    const result = await importLibrary(archive, { mode: 'merge' })
    expect(result.tracksImported).toBe(1)
    expect(result.tracksSkipped).toBe(0)
    expect(result.filesImported).toBe(3)
    expect(result.errors).toEqual([])

    const tracks = await listTracks()
    expect(tracks).toHaveLength(1)
    const track = tracks[0]
    expect(track.id).toBe(seeded.track.id)
    expect(track).toMatchObject({
      name: 'My Beat',
      nameLower: 'my beat',
      bpm: 140,
      musicalKey: 'Am',
      genre: 'trap',
      tags: ['dark'],
      notes: 'note',
      color: '#8B5CF6',
      durationSec: 12.5,
      isFavorite: false,
      audioFileId: seeded.audio.id,
      coverFileId: seeded.cover.id,
      attachmentFileIds: [seeded.attachment.id],
    })

    const audio = await getFile(seeded.audio.id)
    if (!audio) throw new Error('Аудиофайл не импортирован.')
    expect(audio.size).toBe(4)
    const bytes = new Uint8Array(await audio.blob.arrayBuffer())
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4])
  })

  it('пропускает треки с существующим id', async () => {
    await seedLibrary()
    const archive = await exportLibrary()

    const result = await importLibrary(archive, { mode: 'merge' })
    expect(result.tracksImported).toBe(0)
    expect(result.tracksSkipped).toBe(1)
    expect(result.filesImported).toBe(0)
    expect(await listTracks()).toHaveLength(1)
  })
})

describe('importLibrary: replace', () => {
  it('очищает библиотеку и записывает архив', async () => {
    await seedLibrary()
    const archive = await exportLibrary()
    await resetDatabase()
    const extra = await createTrack({ name: 'Extra' })

    const result = await importLibrary(archive, { mode: 'replace' })
    expect(result.tracksImported).toBe(1)
    expect(result.filesImported).toBe(3)
    expect(await getTrack(extra.id)).toBeNull()

    const tracks = await listTracks()
    expect(tracks.map((track) => track.name)).toEqual(['My Beat'])
  })

  it('не трогает данные при повреждённом архиве', async () => {
    await seedLibrary()
    const corrupt = toBlob(new Uint8Array([1, 2, 3, 4]))

    const error = await captureAppErrorAsync(() => importLibrary(corrupt, { mode: 'replace' }))
    expect(error.code).toBe('IMPORT_CORRUPT_ZIP')
    expect(await listTracks()).toHaveLength(1)
  })

  it('не трогает данные при неподдерживаемой версии', async () => {
    await seedLibrary()
    const manifest = {
      app: 'bitvault',
      schemaVersion: 2,
      exportedAt: '2026-01-01T00:00:00.000Z',
      tracks: [],
      files: [],
    }
    const archive = toBlob(await zipFiles({ 'manifest.json': encode(JSON.stringify(manifest)) }))

    const error = await captureAppErrorAsync(() => importLibrary(archive, { mode: 'replace' }))
    expect(error.code).toBe('IMPORT_VERSION_UNSUPPORTED')
    expect(await listTracks()).toHaveLength(1)
  })

  it('сообщает плееру о замене только после проверки архива', async () => {
    await seedLibrary()
    const archive = await exportLibrary()
    await resetDatabase()
    const calls: string[] = []

    await importLibrary(archive, { mode: 'replace', onBeforeWrite: () => calls.push('stop') })
    expect(calls).toEqual(['stop'])

    calls.length = 0
    const error = await captureAppErrorAsync(() =>
      importLibrary(toBlob(new Uint8Array([1, 2, 3, 4])), {
        mode: 'replace',
        onBeforeWrite: () => calls.push('stop'),
      }),
    )
    expect(error.code).toBe('IMPORT_CORRUPT_ZIP')
    expect(calls).toEqual([])
  })
})

describe('importLibrary: ошибки архива', () => {
  it('сообщает о битом ZIP', async () => {
    const error = await captureAppErrorAsync(() =>
      importLibrary(toBlob(new Uint8Array([1, 2, 3, 4])), { mode: 'merge' }),
    )
    expect(error.code).toBe('IMPORT_CORRUPT_ZIP')
  })

  it('сообщает об отсутствии манифеста', async () => {
    const archive = toBlob(await zipFiles({ 'readme.txt': encode('hello') }))
    const error = await captureAppErrorAsync(() => importLibrary(archive, { mode: 'merge' }))
    expect(error.code).toBe('IMPORT_INVALID_MANIFEST')
  })

  it('импортирует трек без аудио, если файла нет в архиве', async () => {
    const manifest = {
      app: 'bitvault',
      schemaVersion: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      tracks: [makeManifestTrack()],
      files: [makeManifestFile()],
    }
    const archive = toBlob(await zipFiles({ 'manifest.json': encode(JSON.stringify(manifest)) }))

    const result = await importLibrary(archive, { mode: 'merge' })
    expect(result.tracksImported).toBe(1)
    expect(result.filesImported).toBe(0)
    expect(result.warnings.some((warning) => warning.includes('отсутствует в архиве'))).toBe(true)

    const tracks = await listTracks()
    expect(tracks).toHaveLength(1)
    expect(tracks[0].audioFileId).toBeNull()
  })

  it('предупреждает о несовпадении заявленного размера с содержимым', async () => {
    const manifest = {
      app: 'bitvault',
      schemaVersion: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      tracks: [makeManifestTrack({ audioFileId: 'f1' })],
      files: [makeManifestFile({ size: 10 })],
    }
    const archive = toBlob(
      await zipFiles({
        'manifest.json': encode(JSON.stringify(manifest)),
        'files/f1.wav': new Uint8Array([1, 2]),
      }),
    )

    const result = await importLibrary(archive, { mode: 'merge' })
    expect(result.filesImported).toBe(1)
    expect(
      result.warnings.some((warning) => warning.includes('не совпадает с содержимым')),
    ).toBe(true)
  })

  it('отклоняет запись с подменённым размером (zip-бомба)', async () => {
    const manifest = {
      app: 'bitvault',
      schemaVersion: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      tracks: [makeManifestTrack()],
      files: [makeManifestFile({ size: 4 })],
    }
    const raw = await zipFiles(
      {
        'manifest.json': encode(JSON.stringify(manifest)),
        'files/f1.wav': new Uint8Array([1, 2, 3, 4]),
      },
      0,
    )
    const forged = patchUncompressedSize(raw, 'files/f1.wav', 3 * 1024 * 1024 * 1024)

    const error = await captureAppErrorAsync(() =>
      importLibrary(toBlob(forged), { mode: 'merge' }),
    )
    expect(error.code).toBe('IMPORT_LIMIT_EXCEEDED')
    expect(await listTracks()).toHaveLength(0)
  })

  it('не распаковывает архив с лишними записями', async () => {
    const entries: Record<string, Uint8Array> = {
      'manifest.json': encode(
        JSON.stringify({
          app: 'bitvault',
          schemaVersion: 1,
          exportedAt: '2026-01-01T00:00:00.000Z',
          tracks: [],
          files: [],
        }),
      ),
    }
    for (let index = 0; index <= LIMITS.importFilesMax; index += 1) {
      entries[`files/junk${index}.bin`] = new Uint8Array([index % 256])
    }
    const archive = toBlob(await zipFiles(entries, 0))

    const error = await captureAppErrorAsync(() => importLibrary(archive, { mode: 'merge' }))
    expect(error.code).toBe('IMPORT_LIMIT_EXCEEDED')
  })
})
