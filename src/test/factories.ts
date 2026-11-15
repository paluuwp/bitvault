import type { ImportResult, Track } from '@/types/models'

let trackCounter = 0

/** Создаёт полный объект трека для компонентных тестов. */
export function makeTrack(overrides: Partial<Track> = {}): Track {
  trackCounter += 1
  const id = overrides.id ?? `track-${trackCounter}`
  const name = overrides.name ?? 'Night Drive'

  return {
    id,
    name,
    nameLower: name.toLocaleLowerCase('ru'),
    bpm: 140,
    musicalKey: 'F#m',
    genre: 'Trap',
    tags: ['trap', 'night', '808'],
    notes: '',
    color: '#8B5CF6',
    audioFileId: null,
    coverFileId: null,
    attachmentFileIds: [],
    isFavorite: false,
    durationSec: 178,
    createdAt: '2026-10-02T18:20:00.000Z',
    updatedAt: '2026-11-05T09:12:00.000Z',
    lastPlayedAt: null,
    playCount: 0,
    ...overrides,
  }
}

/** Файл для событий drag-and-drop и импорта. */
export function makeFile(
  name = 'beat.wav',
  type = 'audio/wav',
  contents: BlobPart[] = ['test'],
): File {
  return new File(contents, name, { type })
}

/** Успешный результат импорта с возможностью добавить предупреждения и ошибки. */
export function makeImportResult(overrides: Partial<ImportResult> = {}): ImportResult {
  return {
    tracksImported: 3,
    tracksSkipped: 0,
    filesImported: 4,
    errors: [],
    warnings: [],
    ...overrides,
  }
}
