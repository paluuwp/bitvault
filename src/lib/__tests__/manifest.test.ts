import { describe, expect, it } from 'vitest'
import type { StoredFile, Track } from '@/types/models'
import { LIMITS } from '../constants'
import {
  buildManifest,
  fileArchivePath,
  isSafeArchivePath,
  parseManifest,
  validateManifest,
} from '../manifest'
import { captureAppError } from './helpers'

function makeFile(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'f1',
    kind: 'audio',
    path: 'files/f1.wav',
    mimeType: 'audio/wav',
    size: 10,
    originalName: 'beat.wav',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeTrack(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 't1',
    name: 'Beat',
    bpm: 120,
    musicalKey: 'Am',
    genre: 'trap',
    tags: ['dark'],
    notes: '',
    color: '#D8FF3E',
    audioFileId: 'f1',
    coverFileId: null,
    attachmentFileIds: [],
    isFavorite: false,
    durationSec: 12,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastPlayedAt: null,
    playCount: 0,
    ...overrides,
  }
}

function makeManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    app: 'bitvault',
    schemaVersion: 1,
    exportedAt: '2026-01-01T00:00:00.000Z',
    tracks: [makeTrack()],
    files: [makeFile()],
    ...overrides,
  }
}

describe('validateManifest', () => {
  it('принимает корректный манифест', () => {
    const manifest = validateManifest(makeManifest())
    expect(manifest.app).toBe('bitvault')
    expect(manifest.schemaVersion).toBe(1)
    expect(manifest.tracks).toHaveLength(1)
    expect(manifest.files).toHaveLength(1)
  })

  it('импортирует старый манифест без author как author = null', () => {
    const manifest = validateManifest(makeManifest())
    expect(manifest.tracks[0]?.author).toBeNull()
    const withAuthor = validateManifest(
      makeManifest({ tracks: [makeTrack({ author: 'Producer' })] }),
    )
    expect(withAuthor.tracks[0]?.author).toBe('Producer')
  })

  it('отклоняет чужое приложение и отсутствие списков', () => {
    expect(captureAppError(() => validateManifest(makeManifest({ app: 'other' }))).code).toBe(
      'IMPORT_INVALID_MANIFEST',
    )
    expect(captureAppError(() => validateManifest(makeManifest({ tracks: undefined }))).code).toBe(
      'IMPORT_INVALID_MANIFEST',
    )
    expect(captureAppError(() => validateManifest('not-an-object')).code).toBe(
      'IMPORT_INVALID_MANIFEST',
    )
  })

  it('отклоняет неподдерживаемую версию схемы', () => {
    expect(captureAppError(() => validateManifest(makeManifest({ schemaVersion: 2 }))).code).toBe(
      'IMPORT_VERSION_UNSUPPORTED',
    )
    expect(captureAppError(() => validateManifest(makeManifest({ schemaVersion: '1' }))).code).toBe(
      'IMPORT_INVALID_MANIFEST',
    )
  })

  it('требует идентификатор и имя трека', () => {
    expect(
      captureAppError(() => validateManifest(makeManifest({ tracks: [makeTrack({ id: '' })] })))
        .code,
    ).toBe('IMPORT_INVALID_MANIFEST')
    expect(
      captureAppError(() =>
        validateManifest(makeManifest({ tracks: [makeTrack({ name: undefined })] })),
      ).code,
    ).toBe('IMPORT_INVALID_MANIFEST')
  })

  it('запрещает небезопасные пути', () => {
    const unsafePaths = [
      'files/../secret.wav',
      'files\\secret.wav',
      '/etc/passwd',
      'C:/secret.wav',
      'files//empty.wav',
    ]
    for (const path of unsafePaths) {
      const error = captureAppError(() =>
        validateManifest(makeManifest({ files: [makeFile({ path })] })),
      )
      expect(error.code).toBe('IMPORT_INVALID_MANIFEST')
    }
  })

  it('ограничивает количество файлов', () => {
    const files = Array.from({ length: LIMITS.importFilesMax + 1 }, (_, index) =>
      makeFile({ id: `f${index}`, path: `files/f${index}.wav` }),
    )
    const error = captureAppError(() => validateManifest(makeManifest({ files })))
    expect(error.code).toBe('IMPORT_LIMIT_EXCEEDED')
  })

  it('ограничивает суммарный размер', () => {
    const files = [
      makeFile({ id: 'f1', path: 'files/f1.wav', size: 10 }),
      makeFile({ id: 'f2', path: 'files/f2.wav', size: LIMITS.importTotalMaxBytes }),
    ]
    const error = captureAppError(() => validateManifest(makeManifest({ files })))
    expect(error.code).toBe('IMPORT_LIMIT_EXCEEDED')
  })

  it('запрещает повторяющиеся пути и идентификаторы', () => {
    const files = [
      makeFile({ id: 'f1', path: 'files/same.wav' }),
      makeFile({ id: 'f2', path: 'files/same.wav' }),
    ]
    expect(captureAppError(() => validateManifest(makeManifest({ files }))).code).toBe(
      'IMPORT_INVALID_MANIFEST',
    )

    const tracks = [makeTrack(), makeTrack({ name: 'Second' })]
    expect(captureAppError(() => validateManifest(makeManifest({ tracks }))).code).toBe(
      'IMPORT_INVALID_MANIFEST',
    )
  })

  it('отклоняет идентификаторы файлов, небезопасные для пути архива', () => {
    const unsafeIds = ['../x', 'a.bin', 'a/b', 'a\\b', 'x'.repeat(129)]
    for (const id of unsafeIds) {
      const error = captureAppError(() =>
        validateManifest(makeManifest({ files: [makeFile({ id })] })),
      )
      expect(error.code).toBe('IMPORT_INVALID_MANIFEST')
    }
  })

  it('очищает имя файла от путей и служебных символов', () => {
    const manifest = validateManifest(
      makeManifest({
        files: [makeFile({ id: 'f1', originalName: '..\\..\\evil.wav' })],
      }),
    )
    expect(manifest.files[0].originalName).toBe('evil.wav')
    expect(fileArchivePath(manifest.files[0])).toBe('files/f1.wav')
  })

  it('ограничивает количество треков', () => {
    const tracks = Array.from({ length: LIMITS.importTracksMax + 1 }, (_, index) =>
      makeTrack({ id: `t${index}` }),
    )
    const error = captureAppError(() => validateManifest(makeManifest({ tracks, files: [] })))
    expect(error.code).toBe('IMPORT_LIMIT_EXCEEDED')
  })

  it('ограничивает число вложений у трека', () => {
    const attachmentFileIds = Array.from(
      { length: LIMITS.attachmentsMax + 1 },
      (_, index) => `a${index}`,
    )
    const error = captureAppError(() =>
      validateManifest(makeManifest({ tracks: [makeTrack({ attachmentFileIds })] })),
    )
    expect(error.code).toBe('IMPORT_INVALID_MANIFEST')
  })
})

describe('isSafeArchivePath', () => {
  it('пропускает относительные пути внутри архива', () => {
    expect(isSafeArchivePath('files/a.wav')).toBe(true)
    expect(isSafeArchivePath('files/sub/a.wav')).toBe(true)
  })

  it('запрещает абсолютные пути, обратные слэши и переходы вверх', () => {
    expect(isSafeArchivePath('files/../a.wav')).toBe(false)
    expect(isSafeArchivePath('files\\a.wav')).toBe(false)
    expect(isSafeArchivePath('/abs.wav')).toBe(false)
    expect(isSafeArchivePath('C:/abs.wav')).toBe(false)
    expect(isSafeArchivePath('')).toBe(false)
  })
})

describe('parseManifest', () => {
  it('сообщает о некорректном JSON', () => {
    expect(captureAppError(() => parseManifest('{')).code).toBe('IMPORT_INVALID_MANIFEST')
  })
})

describe('buildManifest', () => {
  it('сериализует треки и пути файлов', () => {
    const track: Track = {
      id: 't1',
      name: 'Beat',
      nameLower: 'beat',
      bpm: null,
      musicalKey: null,
      author: null,
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
    }
    const file: StoredFile = {
      id: 'f1',
      kind: 'audio',
      blob: new Blob(['x'], { type: 'audio/wav' }),
      mimeType: 'audio/wav',
      size: 1,
      originalName: 'Beat.WAV',
      createdAt: '2026-01-01T00:00:00.000Z',
    }

    const manifest = buildManifest([track], [file], new Date('2026-05-04T10:00:00.000Z'))
    expect(manifest.app).toBe('bitvault')
    expect(manifest.schemaVersion).toBe(1)
    expect(manifest.exportedAt).toBe('2026-05-04T10:00:00.000Z')
    expect(manifest.tracks).toHaveLength(1)
    expect('nameLower' in manifest.tracks[0]).toBe(false)
    expect(manifest.files[0].path).toBe('files/f1.wav')
  })

  it('строит путь с расширением и без него', () => {
    expect(fileArchivePath({ id: 'x', originalName: 'Beat.WAV' })).toBe('files/x.wav')
    expect(fileArchivePath({ id: 'x', originalName: 'project.flp' })).toBe('files/x.flp')
    expect(fileArchivePath({ id: 'x', originalName: 'noext' })).toBe('files/x')
  })

  it('не строит путь из небезопасного id или расширения', () => {
    expect(captureAppError(() => fileArchivePath({ id: '../x', originalName: 'a.wav' })).code).toBe(
      'EXPORT_FAILED',
    )
    expect(fileArchivePath({ id: 'x', originalName: 'beat.wav\\..\\evil' })).toBe('files/x')
  })
})
