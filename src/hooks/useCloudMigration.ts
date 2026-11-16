import { useCallback, useMemo, useState } from 'react'
import { useToast } from '@/context/ToastContext'
import { getCloudContext, isAppError, migrateTrackToCloud } from '@/lib'
import type { Track } from '@/types/models'

export interface CloudMigrationProgress {
  current: number
  total: number
  label: string
}

export interface UseCloudMigrationResult {
  /** Треки, которые есть только на этом устройстве. */
  localTracks: Track[]
  migrating: boolean
  progress: CloudMigrationProgress | null
  /** Переносит локальные треки в библиотеку аккаунта. */
  migrate: () => Promise<void>
}

/**
 * Разовая миграция локальной библиотеки в аккаунт.
 *
 * Перенос идёт по одному треку: при сбое остальные продолжаются, а итог
 * показывается в тосте. Уже перенесённые треки помечаются source: 'cloud'.
 */
export function useCloudMigration(
  tracks: Track[],
  onFinished: () => Promise<void> | void,
): UseCloudMigrationResult {
  const { toast } = useToast()
  const [migrating, setMigrating] = useState(false)
  const [progress, setProgress] = useState<CloudMigrationProgress | null>(null)

  const localTracks = useMemo(
    () => tracks.filter((track) => track.source !== 'cloud'),
    [tracks],
  )

  const migrate = useCallback(async () => {
    const context = getCloudContext()
    if (!context || migrating) return

    setMigrating(true)
    let moved = 0
    let failed = 0
    const issues: string[] = []
    const total = localTracks.length

    try {
      for (let index = 0; index < localTracks.length; index += 1) {
        const track = localTracks[index]
        if (!track) continue
        setProgress({ current: index, total, label: `«${track.name}»` })
        try {
          await migrateTrackToCloud(context, track, (label) => {
            setProgress({ current: index, total, label })
          })
          moved += 1
        } catch (error) {
          failed += 1
          issues.push(isAppError(error) ? error.message : `«${track.name}»`)
          console.error('Не удалось перенести трек в аккаунт', error)
        }
        setProgress({ current: index + 1, total, label: `«${track.name}»` })
      }

      const variant = failed === 0 ? 'success' : moved === 0 ? 'error' : 'info'
      toast({
        title:
          failed === 0
            ? `Перенесено в аккаунт: ${moved}`
            : `Перенесено: ${moved}, ошибок: ${failed}`,
        description: issues.length > 0 ? issues.slice(0, 3).join(' ') : undefined,
        variant,
      })
      await onFinished()
    } finally {
      setMigrating(false)
      setProgress(null)
    }
  }, [localTracks, migrating, onFinished, toast])

  return { localTracks, migrating, progress, migrate }
}
