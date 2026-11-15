import { ImagePlus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button, Spinner } from '@/components/ui'
import { useBlobUrl } from '@/hooks/useBlobUrl'
import {
  IMAGE_EXTENSIONS,
  IMAGE_MIME_TYPES,
  LIMITS,
  isAppError,
  saveFile,
  toAppError,
  validateCoverFile,
} from '@/lib'
import type { TrackColor } from '@/types/models'
import { getCoverGradient, getCoverLetter } from '@/components/library/format'

/** Тот же набор форматов, что принимает drop-зона библиотеки. */
const COVER_ACCEPT = [...IMAGE_MIME_TYPES, ...IMAGE_EXTENSIONS.map((ext) => `.${ext}`)].join(',')

export interface CoverPickerProps {
  coverFileId: string | null
  trackName: string
  color: TrackColor
  error?: string
  disabled?: boolean
  /** `createdFileId` заполняется, если файл только что сохранён в хранилище. */
  onChange: (fileId: string | null, createdFileId?: string) => void
  onError: (message: string) => void
  /** Сообщает редактору, что обложка ещё записывается: сохранять трек пока нельзя. */
  onBusyChange?: (busy: boolean) => void
}

export function CoverPicker({
  coverFileId,
  trackName,
  color,
  error,
  disabled = false,
  onChange,
  onError,
  onBusyChange,
}: CoverPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)
  const cover = useBlobUrl(coverFileId)
  const maxMegabytes = Math.round(LIMITS.coverFileMaxBytes / (1024 * 1024))
  const busy = disabled || saving

  useEffect(() => {
    onBusyChange?.(saving)
  }, [saving, onBusyChange])

  const handleFile = async (file: File) => {
    try {
      validateCoverFile(file)
    } catch (caught) {
      onError(isAppError(caught) ? caught.message : 'Этот файл нельзя использовать как обложку.')
      return
    }

    setSaving(true)
    // Синхронно сообщаем редактору: до flush эффекта Save уже должен быть закрыт.
    onBusyChange?.(true)
    try {
      const saved = await saveFile('cover', file, file.name, file.type)
      onChange(saved.id, saved.id)
    } catch (caught) {
      console.error('Не удалось сохранить обложку', caught)
      onError(toAppError(caught).message)
    } finally {
      setSaving(false)
      onBusyChange?.(false)
    }
  }

  return (
    <section aria-label="Обложка" className="flex items-start gap-4">
      <div
        className="relative flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-control border border-border"
        style={{ backgroundImage: getCoverGradient(color) }}
      >
        {cover.url ? (
          <img
            src={cover.url}
            alt={`Обложка трека «${trackName}»`}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="text-display font-semibold text-accent-ink/70 select-none"
          >
            {getCoverLetter(trackName)}
          </span>
        )}

        {(saving || cover.loading) && (
          <span className="absolute inset-0 flex items-center justify-center bg-bg/60">
            <Spinner size="lg" label="Загрузка обложки" className="text-text" />
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-body font-medium text-text">Обложка</p>
        <p className="text-caption text-text-muted">
          JPEG, PNG, WebP, GIF или AVIF до {maxMegabytes} МБ. Если обложки нет, используется цвет.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            loading={saving}
            disabled={busy}
            leftIcon={<ImagePlus className="h-4 w-4" aria-hidden="true" />}
            onClick={() => inputRef.current?.click()}
          >
            {coverFileId ? 'Заменить' : 'Выбрать обложку'}
          </Button>

          {coverFileId && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              leftIcon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
              onClick={() => onChange(null)}
            >
              Удалить
            </Button>
          )}
        </div>

        {error && (
          <p role="alert" className="text-caption text-danger">
            {error}
          </p>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={COVER_ACCEPT}
        className="hidden"
        aria-label="Выбрать файл обложки"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void handleFile(file)
        }}
      />
    </section>
  )
}
