import { describe, expect, it } from 'vitest'
import type { MusicalKey, TrackColor } from '@/types/models'
import { DEFAULT_TRACK_COLOR, LIMITS } from '../constants'
import {
  normalizeImportedTrackMetadata,
  normalizeNewTrack,
  normalizePatch,
  sanitizeTags,
  validateAttachmentFile,
  validateAudioFile,
  validateCoverFile,
  type FileMetadata,
} from '../validation'
import { captureAppError } from './helpers'

function fileMetadata(overrides: Partial<FileMetadata> = {}): FileMetadata {
  return { name: 'beat.wav', type: 'audio/wav', size: 1024, ...overrides }
}

describe('normalizeNewTrack', () => {
  it('заполняет значения по умолчанию и обрезает имя', () => {
    const track = normalizeNewTrack({ name: '  My Beat  ' })
    expect(track).toEqual({
      name: 'My Beat',
      bpm: null,
      musicalKey: null,
      author: null,
      genre: null,
      tags: [],
      notes: '',
      color: DEFAULT_TRACK_COLOR,
      audioFileId: null,
      coverFileId: null,
      attachmentFileIds: [],
      durationSec: null,
      isFavorite: false,
    })
  })

  it('нормализует автора: trim, пустая строка в null, ограничение длины', () => {
    expect(normalizeNewTrack({ name: 'A', author: '  Producer ' }).author).toBe('Producer')
    expect(normalizeNewTrack({ name: 'A', author: '   ' }).author).toBeNull()
    expect(normalizeNewTrack({ name: 'A' }).author).toBeNull()
    expect(normalizeNewTrack({ name: 'A', author: 'a'.repeat(LIMITS.authorMax) }).author).toHaveLength(
      LIMITS.authorMax,
    )
    expect(
      captureAppError(() => normalizeNewTrack({ name: 'A', author: 'a'.repeat(LIMITS.authorMax + 1) }))
        .code,
    ).toBe('VALIDATION')
    expect(normalizePatch({ author: ' ' }).author).toBeNull()
  })

  it('отклоняет пустое и слишком длинное имя', () => {
    expect(captureAppError(() => normalizeNewTrack({ name: '   ' })).code).toBe('VALIDATION')
    expect(
      captureAppError(() => normalizeNewTrack({ name: 'a'.repeat(LIMITS.nameMax + 1) })).code,
    ).toBe('VALIDATION')
  })

  it('проверяет BPM', () => {
    expect(normalizeNewTrack({ name: 'A', bpm: 128 }).bpm).toBe(128)
    expect(normalizeNewTrack({ name: 'A', bpm: null }).bpm).toBeNull()
    expect(captureAppError(() => normalizeNewTrack({ name: 'A', bpm: 19 })).code).toBe('VALIDATION')
    expect(captureAppError(() => normalizeNewTrack({ name: 'A', bpm: 401 })).code).toBe('VALIDATION')
    expect(captureAppError(() => normalizeNewTrack({ name: 'A', bpm: 120.5 })).code).toBe(
      'VALIDATION',
    )
  })

  it('проверяет тональность, жанр, заметки и цвет', () => {
    expect(normalizeNewTrack({ name: 'A', musicalKey: 'C#m' }).musicalKey).toBe('C#m')
    expect(
      captureAppError(() => normalizeNewTrack({ name: 'A', musicalKey: 'H' as unknown as MusicalKey })).code,
    ).toBe('VALIDATION')

    expect(normalizeNewTrack({ name: 'A', genre: '  phonk ' }).genre).toBe('phonk')
    expect(
      captureAppError(() => normalizeNewTrack({ name: 'A', genre: 'g'.repeat(LIMITS.genreMax + 1) }))
        .code,
    ).toBe('VALIDATION')

    expect(normalizeNewTrack({ name: 'A', notes: '  text  ' }).notes).toBe('text')
    expect(
      captureAppError(() => normalizeNewTrack({ name: 'A', notes: 'n'.repeat(LIMITS.notesMax + 1) }))
        .code,
    ).toBe('VALIDATION')

    expect(normalizeNewTrack({ name: 'A', color: '#8B5CF6' }).color).toBe('#8B5CF6')
    expect(
      captureAppError(() => normalizeNewTrack({ name: 'A', color: '#000000' as unknown as TrackColor })).code,
    ).toBe('VALIDATION')
  })

  it('нормализует ссылки на файлы', () => {
    const track = normalizeNewTrack({
      name: 'A',
      audioFileId: ' a1 ',
      coverFileId: '',
      attachmentFileIds: ['x', 'x', ' y '],
    })
    expect(track.audioFileId).toBe('a1')
    expect(track.coverFileId).toBeNull()
    expect(track.attachmentFileIds).toEqual(['x', 'y'])
  })
})

describe('sanitizeTags', () => {
  it('убирает решётку, пробелы и дубли без учёта регистра', () => {
    expect(sanitizeTags(['#tag', ' Tag ', 'TAG', '', 'a'.repeat(30)])).toEqual([
      'tag',
      'a'.repeat(LIMITS.tagLengthMax),
    ])
  })

  it('ограничивает количество тегов', () => {
    const tags = Array.from({ length: LIMITS.tagsMax + 3 }, (_, index) => `tag${index}`)
    expect(sanitizeTags(tags)).toHaveLength(LIMITS.tagsMax)
  })

  it('поддерживает строку через запятую', () => {
    expect(sanitizeTags('#dark, phonk ,,DARK')).toEqual(['dark', 'phonk'])
  })

  it('возвращает пустой массив для нестроковых значений', () => {
    expect(sanitizeTags(null)).toEqual([])
    expect(sanitizeTags(42)).toEqual([])
  })
})

describe('normalizePatch', () => {
  it('нормализует только переданные поля', () => {
    const patch = normalizePatch({ name: '  Next  ' })
    expect(patch.name).toBe('Next')
    expect('bpm' in patch).toBe(false)
    expect('tags' in patch).toBe(false)
  })

  it('поддерживает сброс значения в null', () => {
    const patch = normalizePatch({ bpm: null, musicalKey: null })
    expect('bpm' in patch).toBe(true)
    expect(patch.bpm).toBeNull()
    expect(patch.musicalKey).toBeNull()
  })

  it('валидирует изменённые поля', () => {
    expect(captureAppError(() => normalizePatch({ bpm: 10 })).code).toBe('VALIDATION')
    expect(captureAppError(() => normalizePatch({ name: '' })).code).toBe('VALIDATION')
    expect(normalizePatch({ tags: ['#A', 'a'] }).tags).toEqual(['A'])
    expect(normalizePatch({ isFavorite: true }).isFavorite).toBe(true)
  })
})

describe('validateAudioFile', () => {
  it('принимает аудио по MIME-типу и расширению', () => {
    expect(validateAudioFile(fileMetadata()).kind).toBe('audio')
    expect(validateAudioFile(fileMetadata({ name: 'BEAT.MP3', type: '' })).kind).toBe('audio')
  })

  it('отклоняет неподдерживаемый формат', () => {
    expect(
      captureAppError(() => validateAudioFile(fileMetadata({ name: 'beat.txt', type: 'text/plain' })))
        .code,
    ).toBe('UNSUPPORTED_AUDIO')
  })

  it('отклоняет слишком большой файл', () => {
    expect(
      captureAppError(() =>
        validateAudioFile(fileMetadata({ size: LIMITS.audioFileMaxBytes + 1 })),
      ).code,
    ).toBe('FILE_TOO_LARGE')
  })
})

describe('validateCoverFile', () => {
  it('принимает изображение', () => {
    expect(
      validateCoverFile(fileMetadata({ name: 'cover.PNG', type: '', size: 10 })).kind,
    ).toBe('cover')
  })

  it('отклоняет неподдерживаемый формат и размер', () => {
    expect(
      captureAppError(() => validateCoverFile(fileMetadata({ name: 'cover.txt', type: 'text/plain' })))
        .code,
    ).toBe('UNSUPPORTED_IMAGE')
    expect(
      captureAppError(() => validateCoverFile(fileMetadata({ name: 'cover.png', type: 'image/png', size: LIMITS.coverFileMaxBytes + 1 })))
        .code,
    ).toBe('FILE_TOO_LARGE')
  })
})

describe('validateAttachmentFile', () => {
  it('принимает произвольное вложение', () => {
    expect(
      validateAttachmentFile(fileMetadata({ name: 'project.flp', type: '', size: 10 })).kind,
    ).toBe('attachment')
  })

  it('отклоняет слишком большое вложение', () => {
    expect(
      captureAppError(() =>
        validateAttachmentFile(fileMetadata({ name: 'project.flp', size: LIMITS.attachmentFileMaxBytes + 1 })),
      ).code,
    ).toBe('FILE_TOO_LARGE')
  })
})

describe('normalizeImportedTrackMetadata', () => {
  it('мягко обрезает некорректные значения и собирает предупреждения', () => {
    const { track, warnings } = normalizeImportedTrackMetadata({
      id: 't1',
      name: 'x'.repeat(LIMITS.nameMax + 20),
      bpm: 500,
      musicalKey: 'H',
      genre: 'g'.repeat(LIMITS.genreMax + 5),
      tags: Array.from({ length: LIMITS.tagsMax + 5 }, (_, index) => `tag${index}`),
      notes: 'n'.repeat(LIMITS.notesMax + 5),
      color: 'red',
      audioFileId: ' f1 ',
      playCount: -5,
      createdAt: 'not-a-date',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })

    expect(track.name).toHaveLength(LIMITS.nameMax)
    expect(track.bpm).toBe(LIMITS.bpmMax)
    expect(track.musicalKey).toBeNull()
    expect(track.genre).toHaveLength(LIMITS.genreMax)
    expect(track.tags).toHaveLength(LIMITS.tagsMax)
    expect(track.notes).toHaveLength(LIMITS.notesMax)
    expect(track.color).toBe(DEFAULT_TRACK_COLOR)
    expect(track.audioFileId).toBe('f1')
    expect(track.playCount).toBe(0)
    expect(warnings.length).toBeGreaterThan(0)
  })

  it('подставляет название для пустого имени', () => {
    const { track, warnings } = normalizeImportedTrackMetadata({ name: '   ' })
    expect(track.name).toBe('Без названия')
    expect(warnings.some((warning) => warning.includes('Без названия'))).toBe(true)
  })
})
