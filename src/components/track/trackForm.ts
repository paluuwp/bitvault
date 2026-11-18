import { LIMITS } from '@/lib'
import type { MusicalKey, Track, TrackColor, TrackPatch } from '@/types/models'

export interface TrackFormState {
  name: string
  bpm: string
  musicalKey: MusicalKey | ''
  author: string
  genre: string
  tags: string[]
  notes: string
  color: TrackColor
  coverFileId: string | null
  attachmentFileIds: string[]
}

export type TrackFormField = keyof TrackFormState

export interface TrackFormErrors {
  name?: string
  bpm?: string
  author?: string
  genre?: string
  tags?: string
  notes?: string
  cover?: string
}

export const TRACK_COLOR_LABELS: Record<TrackColor, string> = {
  '#D8FF3E': 'лаймовый',
  '#8B5CF6': 'фиолетовый',
  '#38BDF8': 'голубой',
  '#FB7185': 'розовый',
  '#F59E0B': 'янтарный',
  '#34D399': 'изумрудный',
}

export function trackToForm(track: Track): TrackFormState {
  return {
    name: track.name,
    bpm: track.bpm === null ? '' : String(track.bpm),
    musicalKey: track.musicalKey ?? '',
    author: track.author ?? '',
    genre: track.genre ?? '',
    tags: [...track.tags],
    notes: track.notes,
    color: track.color,
    coverFileId: track.coverFileId,
    attachmentFileIds: [...track.attachmentFileIds],
  }
}

export function formToPatch(form: TrackFormState): TrackPatch {
  const genre = form.genre.trim()
  const author = form.author.trim()
  const bpm = form.bpm.trim() === '' ? null : Number(form.bpm.trim())

  return {
    name: form.name.trim(),
    bpm,
    musicalKey: form.musicalKey === '' ? null : form.musicalKey,
    author: author === '' ? null : author,
    genre: genre === '' ? null : genre,
    tags: form.tags,
    notes: form.notes.trim(),
    color: form.color,
    coverFileId: form.coverFileId,
    attachmentFileIds: form.attachmentFileIds,
  }
}

export function validateTrackForm(form: TrackFormState): TrackFormErrors {
  const errors: TrackFormErrors = {}
  const name = form.name.trim()

  if (name.length === 0) {
    errors.name = 'Введите название трека.'
  } else if (name.length > LIMITS.nameMax) {
    errors.name = `Название не должно превышать ${LIMITS.nameMax} символов.`
  }

  const bpmRaw = form.bpm.trim()
  if (bpmRaw !== '') {
    if (!/^\d+$/.test(bpmRaw)) {
      errors.bpm = 'BPM должен быть целым числом.'
    } else {
      const bpm = Number(bpmRaw)
      if (bpm < LIMITS.bpmMin || bpm > LIMITS.bpmMax) {
        errors.bpm = `BPM должен быть от ${LIMITS.bpmMin} до ${LIMITS.bpmMax}.`
      }
    }
  }

  if (form.author.trim().length > LIMITS.authorMax) {
    errors.author = `Автор не должен превышать ${LIMITS.authorMax} символов.`
  }

  if (form.genre.trim().length > LIMITS.genreMax) {
    errors.genre = `Жанр не должен превышать ${LIMITS.genreMax} символов.`
  }

  if (form.tags.length > LIMITS.tagsMax) {
    errors.tags = `Можно добавить не больше ${LIMITS.tagsMax} тегов.`
  } else {
    const tooLong = form.tags.find((tag) => tag.length > LIMITS.tagLengthMax)
    if (tooLong) {
      errors.tags = `Тег не должен превышать ${LIMITS.tagLengthMax} символа.`
    } else {
      const seen = new Set<string>()
      for (const tag of form.tags) {
        const key = tag.toLocaleLowerCase('ru')
        if (seen.has(key)) {
          errors.tags = 'Теги не должны повторяться.'
          break
        }
        seen.add(key)
      }
    }
  }

  if (form.notes.trim().length > LIMITS.notesMax) {
    errors.notes = `Заметки не должны превышать ${LIMITS.notesMax} символов.`
  }

  return errors
}

export function hasTrackFormErrors(errors: TrackFormErrors): boolean {
  return Object.values(errors).some((message) => message !== undefined)
}

export function isTrackFormEqual(left: TrackFormState, right: TrackFormState): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}
