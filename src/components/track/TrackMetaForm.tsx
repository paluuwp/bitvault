import { clsx } from 'clsx'
import { Check, X } from 'lucide-react'
import { useState } from 'react'
import { Input, Select, Textarea } from '@/components/ui'
import { LIMITS, MUSICAL_KEYS, TRACK_COLORS } from '@/lib'
import type { MusicalKey } from '@/types/models'
import {
  TRACK_COLOR_LABELS,
  type TrackFormErrors,
  type TrackFormState,
} from './trackForm'

export interface TrackMetaFormProps {
  form: TrackFormState
  errors: TrackFormErrors
  disabled?: boolean
  onChange: (next: TrackFormState) => void
  onClearError: (field: keyof TrackFormErrors) => void
  onError: (field: keyof TrackFormErrors, message: string) => void
}

export function TrackMetaForm({
  form,
  errors,
  disabled = false,
  onChange,
  onClearError,
  onError,
}: TrackMetaFormProps) {
  const [tagInput, setTagInput] = useState('')

  const addTag = (raw: string) => {
    const value = raw.trim().replace(/^#+/, '').trim()
    if (!value) return

    if (form.tags.length >= LIMITS.tagsMax) {
      onError('tags', `Можно добавить не больше ${LIMITS.tagsMax} тегов.`)
      return
    }
    if (value.length > LIMITS.tagLengthMax) {
      onError('tags', `Тег не должен превышать ${LIMITS.tagLengthMax} символа.`)
      return
    }
    if (form.tags.some((tag) => tag.toLocaleLowerCase('ru') === value.toLocaleLowerCase('ru'))) {
      onError('tags', 'Такой тег уже есть.')
      setTagInput('')
      return
    }

    onChange({ ...form, tags: [...form.tags, value] })
    onClearError('tags')
    setTagInput('')
  }

  const handleTagInputChange = (value: string) => {
    if (value.includes(',') || value.includes(';')) {
      const [head, ...rest] = value.split(/[,;]/)
      if (head) addTag(head)
      setTagInput(rest.join(',').trimStart())
      return
    }
    setTagInput(value)
  }

  const removeTag = (tag: string) => {
    onChange({ ...form, tags: form.tags.filter((item) => item !== tag) })
    onClearError('tags')
  }

  return (
    <div className="flex flex-col gap-4">
      <Input
        label="Название"
        value={form.name}
        maxLength={LIMITS.nameMax}
        disabled={disabled}
        error={errors.name}
        onChange={(event) => {
          onChange({ ...form, name: event.target.value })
          onClearError('name')
        }}
      />

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="BPM"
          value={form.bpm}
          inputMode="numeric"
          maxLength={3}
          placeholder="Например, 140"
          className="font-mono"
          disabled={disabled}
          error={errors.bpm}
          hint={`От ${LIMITS.bpmMin} до ${LIMITS.bpmMax} или пусто`}
          onChange={(event) => {
            onChange({ ...form, bpm: event.target.value })
            onClearError('bpm')
          }}
        />

        <Select
          label="Тональность"
          value={form.musicalKey}
          disabled={disabled}
          onChange={(event) => {
            onChange({ ...form, musicalKey: event.target.value as MusicalKey | '' })
          }}
        >
          <option value="">Не указана</option>
          {MUSICAL_KEYS.map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </Select>
      </div>

      <Input
        label="Автор"
        value={form.author}
        maxLength={LIMITS.authorMax}
        disabled={disabled}
        error={errors.author}
        placeholder="Имя исполнителя или продюсера"
        onChange={(event) => {
          onChange({ ...form, author: event.target.value })
          onClearError('author')
        }}
      />

      <Input
        label="Жанр"
        value={form.genre}
        maxLength={LIMITS.genreMax}
        disabled={disabled}
        error={errors.genre}
        placeholder="Например, Trap"
        onChange={(event) => {
          onChange({ ...form, genre: event.target.value })
          onClearError('genre')
        }}
      />

      <div className="flex flex-col gap-2">
        <Input
          label="Теги"
          value={tagInput}
          disabled={disabled || form.tags.length >= LIMITS.tagsMax}
          error={errors.tags}
          hint={`Enter или запятая. До ${LIMITS.tagsMax} тегов, каждый до ${LIMITS.tagLengthMax} символов.`}
          placeholder={
            form.tags.length >= LIMITS.tagsMax
              ? 'Достигнут лимит тегов'
              : 'Введите тег и нажмите Enter'
          }
          onChange={(event) => handleTagInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault()
              addTag(tagInput)
            }
            if (event.key === 'Backspace' && tagInput === '' && form.tags.length > 0) {
              const lastTag = form.tags[form.tags.length - 1]
              if (lastTag) removeTag(lastTag)
            }
          }}
          onBlur={() => {
            if (tagInput.trim()) addTag(tagInput)
          }}
        />

        {form.tags.length > 0 && (
          <ul aria-label="Добавленные теги" className="flex flex-wrap gap-1.5">
            {form.tags.map((tag) => (
              <li
                key={tag}
                className="inline-flex min-h-10 max-w-full items-center gap-1 rounded-chip border border-divider bg-bg-subtle py-0.5 pr-0.5 pl-2.5 text-caption text-text-muted sm:min-h-0 sm:pr-1"
              >
                <span className="min-w-0 truncate">#{tag}</span>
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={`Удалить тег «${tag}»`}
                  onClick={() => removeTag(tag)}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-chip transition-colors hover:bg-surface-hover hover:text-text disabled:pointer-events-none disabled:opacity-40 sm:h-5 sm:w-5"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Textarea
        label="Заметки"
        value={form.notes}
        rows={5}
        maxLength={LIMITS.notesMax}
        disabled={disabled}
        error={errors.notes}
        hint={`До ${LIMITS.notesMax} символов`}
        onChange={(event) => {
          onChange({ ...form, notes: event.target.value })
          onClearError('notes')
        }}
      />

      <fieldset disabled={disabled}>
        <legend className="text-caption text-text-muted">Цвет</legend>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {TRACK_COLORS.map((color) => {
            const active = form.color === color
            return (
              <button
                key={color}
                type="button"
                aria-label={`Цвет: ${TRACK_COLOR_LABELS[color]}`}
                aria-pressed={active}
                onClick={() => {
                  onChange({ ...form, color })
                }}
                className={clsx(
                  'relative inline-flex h-11 w-11 items-center justify-center rounded-control border-2 transition-colors disabled:pointer-events-none disabled:opacity-40 sm:h-9 sm:w-9',
                  active
                    ? 'border-accent ring-2 ring-accent/40'
                    : 'border-transparent hover:border-border-strong',
                )}
                style={{ backgroundColor: color }}
              >
                {active && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0.5 rounded-chip border border-accent-ink/30"
                  />
                )}
                {active && <Check className="h-4 w-4 text-accent-ink" aria-hidden="true" />}
              </button>
            )
          })}
        </div>
        <p className="mt-1.5 text-caption text-text-muted">
          Цвет используется, если у трека нет обложки.
        </p>
      </fieldset>
    </div>
  )
}
