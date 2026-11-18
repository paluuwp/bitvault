import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, ConfirmDialog, Drawer } from '@/components/ui'
import { FavoriteButton } from '@/components/library/FavoriteButton'
import { deleteFileIfOrphan, isAppError } from '@/lib'
import type { Track, TrackPatch } from '@/types/models'
import { AttachmentList } from './AttachmentList'
import { CoverPicker } from './CoverPicker'
import { TrackMetaForm } from './TrackMetaForm'
import {
  formToPatch,
  hasTrackFormErrors,
  isTrackFormEqual,
  trackToForm,
  validateTrackForm,
  type TrackFormErrors,
  type TrackFormState,
} from './trackForm'

export interface TrackDetailDrawerProps {
  open: boolean
  track: Track | null
  onClose: () => void
  onSave: (id: string, patch: TrackPatch) => Promise<Track>
  onToggleFavorite: (track: Track) => void
}

export function TrackDetailDrawer({
  open,
  track,
  onClose,
  onSave,
  onToggleFavorite,
}: TrackDetailDrawerProps) {
  const [form, setForm] = useState<TrackFormState | null>(null)
  const [errors, setErrors] = useState<TrackFormErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [coverSaving, setCoverSaving] = useState(false)
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false)

  const initialFormRef = useRef<TrackFormState | null>(null)
  const trackRef = useRef<Track | null>(track)
  const previousTrackIdRef = useRef<string | null>(null)
  const createdCoverIdsRef = useRef<Set<string>>(new Set())
  const trackId = track?.id ?? null

  trackRef.current = track

  const cleanupCreatedCovers = useCallback(() => {
    for (const fileId of createdCoverIdsRef.current) {
      // Обложки, выбранные и не сохранённые в треке, удаляются как осиротевшие.
      void deleteFileIfOrphan(fileId).catch(() => undefined)
    }
    createdCoverIdsRef.current.clear()
  }, [])

  useEffect(() => {
    const current = trackRef.current

    if (open && current) {
      if (previousTrackIdRef.current && previousTrackIdRef.current !== current.id) {
        cleanupCreatedCovers()
      }
      previousTrackIdRef.current = current.id

      const nextForm = trackToForm(current)
      setForm(nextForm)
      initialFormRef.current = nextForm
      setErrors({})
      setSubmitError(null)
      setConfirmCloseOpen(false)
      return
    }

    previousTrackIdRef.current = null
    setForm(null)
    initialFormRef.current = null
    setErrors({})
    setSubmitError(null)
    setConfirmCloseOpen(false)
    cleanupCreatedCovers()
  }, [open, trackId, cleanupCreatedCovers])

  const dirty =
    form !== null && initialFormRef.current !== null && !isTrackFormEqual(form, initialFormRef.current)

  /** Пока обложка записывается, патч сохранять нельзя — иначе в трек уйдёт старый id. */
  const busy = saving || coverSaving

  useEffect(() => {
    if (!open || !dirty) return
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [open, dirty])

  const requestClose = useCallback(() => {
    if (busy) return
    if (dirty) {
      setConfirmCloseOpen(true)
      return
    }
    onClose()
  }, [busy, dirty, onClose])

  const clearError = useCallback((field: keyof TrackFormErrors) => {
    setErrors((previous) => {
      if (previous[field] === undefined) return previous
      const next = { ...previous }
      delete next[field]
      return next
    })
  }, [])

  const setFieldError = useCallback((field: keyof TrackFormErrors, message: string) => {
    setErrors((previous) => {
      const next = { ...previous }
      next[field] = message
      return next
    })
  }, [])

  const handleFormChange = useCallback((next: TrackFormState) => {
    setForm(next)
  }, [])

  const handleCoverChange = useCallback(
    (fileId: string | null, createdFileId?: string) => {
      if (createdFileId) createdCoverIdsRef.current.add(createdFileId)
      setForm((previous) => (previous ? { ...previous, coverFileId: fileId } : previous))
      clearError('cover')
    },
    [clearError],
  )

  const handleRemoveAttachment = useCallback((fileId: string) => {
    setForm((previous) =>
      previous
        ? {
            ...previous,
            attachmentFileIds: previous.attachmentFileIds.filter((id) => id !== fileId),
          }
        : previous,
    )
  }, [])

  const handleSave = async () => {
    const current = trackRef.current
    if (!current || !form || busy) return

    const nextErrors = validateTrackForm(form)
    if (hasTrackFormErrors(nextErrors)) {
      setErrors(nextErrors)
      setSubmitError('Проверьте выделенные поля.')
      return
    }

    setSaving(true)
    setSubmitError(null)

    try {
      const patch = formToPatch(form)
      await onSave(current.id, patch)

      if (current.coverFileId && current.coverFileId !== form.coverFileId) {
        void deleteFileIfOrphan(current.coverFileId).catch(() => undefined)
      }
      const removedAttachments = current.attachmentFileIds.filter(
        (fileId) => !form.attachmentFileIds.includes(fileId),
      )
      for (const fileId of removedAttachments) {
        void deleteFileIfOrphan(fileId).catch(() => undefined)
      }

      onClose()
    } catch (caught) {
      setSubmitError(
        isAppError(caught) ? caught.message : 'Не удалось сохранить изменения.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Drawer
        open={open && track !== null}
        onClose={requestClose}
        title="Редактирование бита"
        description={track?.name}
        footer={
          form ? (
            <>
              <Button variant="ghost" onClick={requestClose} disabled={busy}>
                Отмена
              </Button>
              <Button onClick={() => void handleSave()} loading={saving} disabled={coverSaving}>
                {coverSaving ? 'Загрузка обложки…' : 'Сохранить'}
              </Button>
            </>
          ) : undefined
        }
      >
        {form && track && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between gap-3 rounded-card border border-white/10 bg-white/[0.04] bg-gradient-to-br from-white/[0.06] to-transparent p-4">
              <div className="min-w-0">
                <p className="text-body font-medium text-text">Избранное</p>
                <p className="text-caption text-text-muted">
                  {track.isFavorite
                    ? 'Трек отмечен сердцем.'
                    : 'Можно добавить трек в избранное.'}
                </p>
              </div>
              <FavoriteButton
                isFavorite={track.isFavorite}
                trackName={track.name}
                disabled={busy}
                variant="plain"
                onToggle={() => onToggleFavorite(track)}
              />
            </div>

            <div className="rounded-card border border-white/10 bg-white/[0.04] bg-gradient-to-br from-white/[0.06] to-transparent p-4">
              <CoverPicker
                coverFileId={form.coverFileId}
                trackName={form.name.trim() || track.name}
                color={form.color}
                error={errors.cover}
                disabled={saving}
                onChange={handleCoverChange}
                onError={(message) => setFieldError('cover', message)}
                onBusyChange={setCoverSaving}
              />
            </div>

            <div className="rounded-card border border-white/10 bg-white/[0.04] bg-gradient-to-br from-white/[0.06] to-transparent p-4">
              <TrackMetaForm
                form={form}
                errors={errors}
                disabled={busy}
                onChange={handleFormChange}
                onClearError={clearError}
                onError={setFieldError}
              />
            </div>

            <div className="rounded-card border border-white/10 bg-white/[0.04] bg-gradient-to-br from-white/[0.06] to-transparent p-4">
              <AttachmentList
                fileIds={form.attachmentFileIds}
                disabled={busy}
                onRemove={handleRemoveAttachment}
              />
            </div>

            {submitError && (
              <p
                role="alert"
                className="rounded-control border border-danger/40 bg-danger/10 px-3 py-2 text-caption text-danger"
              >
                {submitError}
              </p>
            )}
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={confirmCloseOpen}
        title="Выйти без сохранения?"
        description="Несохранённые изменения будут потеряны."
        confirmLabel="Выйти без сохранения"
        cancelLabel="Продолжить редактирование"
        destructive
        onConfirm={() => {
          setConfirmCloseOpen(false)
          onClose()
        }}
        onCancel={() => setConfirmCloseOpen(false)}
      />
    </>
  )
}
