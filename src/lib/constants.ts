import type { MusicalKey, TrackColor } from '@/types/models'

/** Ограничения полей и файлов, общие для валидации, импорта и интерфейса. */
export const LIMITS = {
  nameMin: 1,
  nameMax: 100,
  bpmMin: 20,
  bpmMax: 400,
  genreMax: 40,
  authorMax: 120,
  tagsMax: 10,
  tagLengthMax: 24,
  notesMax: 2000,
  audioFileMaxBytes: 250 * 1024 * 1024,
  coverFileMaxBytes: 10 * 1024 * 1024,
  attachmentFileMaxBytes: 250 * 1024 * 1024,
  /** Предел тела запроса Worker: больше в библиотеку аккаунта не загрузить. */
  cloudFileMaxBytes: 90 * 1024 * 1024,
  attachmentsMax: 50,
  dropFilesMax: 50,
  importFilesMax: 5000,
  importTracksMax: 10000,
  importTotalMaxBytes: 2 * 1024 * 1024 * 1024,
  /** Запас поверх суммы файлов: заголовки ZIP и несжатый manifest.json. */
  importArchiveMaxBytes: 2 * 1024 * 1024 * 1024 + 128 * 1024 * 1024,
  importManifestMaxBytes: 32 * 1024 * 1024,
} as const

export const TRACK_COLORS: readonly TrackColor[] = [
  '#D8FF3E',
  '#8B5CF6',
  '#38BDF8',
  '#FB7185',
  '#F59E0B',
  '#34D399',
]

export const DEFAULT_TRACK_COLOR: TrackColor = '#D8FF3E'

/** 24 тональности в нотации FL Studio. */
export const MUSICAL_KEYS: readonly MusicalKey[] = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
  'Cm',
  'C#m',
  'Dm',
  'D#m',
  'Em',
  'Fm',
  'F#m',
  'Gm',
  'G#m',
  'Am',
  'A#m',
  'Bm',
]

export const AUDIO_MIME_TYPES: readonly string[] = [
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/vnd.wave',
  'audio/mpeg',
  'audio/mp3',
  'audio/x-mp3',
  'audio/flac',
  'audio/x-flac',
  'audio/ogg',
  'audio/vorbis',
  'audio/opus',
  'audio/aiff',
  'audio/x-aiff',
  'audio/aac',
  'audio/m4a',
  'audio/x-m4a',
  'audio/mp4',
]

export const AUDIO_EXTENSIONS: readonly string[] = [
  'wav',
  'wave',
  'mp3',
  'flac',
  'ogg',
  'oga',
  'opus',
  'aif',
  'aiff',
  'm4a',
  'aac',
]

export const IMAGE_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]

export const IMAGE_EXTENSIONS: readonly string[] = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif']

export const STORAGE_KEYS = {
  view: 'bv.view',
  sort: 'bv.sort',
  volume: 'bv.volume',
  authSession: 'bv.auth.session',
} as const

export const DB_NAME = 'bitvault'
export const DB_VERSION = 1

export const MANIFEST_APP = 'bitvault'
export const MANIFEST_SCHEMA_VERSION = 1
export const MANIFEST_ENTRY = 'manifest.json'
export const FILES_DIR = 'files'
