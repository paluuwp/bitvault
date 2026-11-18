import { useCallback, useEffect, useRef, useState } from 'react'
import { createTrackFromFile, isAppError, requestPersistence } from '@/lib'
import { useToast } from '@/context/ToastContext'

export interface UploadProgressState {
  /** Сколько файлов уже обработано. */
  current: number
  total: number
  /** Имя файла, который обрабатывается сейчас, или этап завершения. */
  label: string
}

export interface UseUploadResult {
  uploadFiles: (files: FileList | File[]) => Promise<void>
  progress: UploadProgressState | null
  isUploading: boolean
}

function describeFileError(error: unknown): string {
  if (isAppError(error)) return error.message
  return 'Не удалось добавить файл.'
}

function summarize(added: number, failed: number): string {
  return `Добавлено ${added}, ошибок ${failed}`
}

export function useUpload(refresh: () => Promise<void>): UseUploadResult {
  const { toast } = useToast()
  const [progress, setProgress] = useState<UploadProgressState | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  const uploadingRef = useRef(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const uploadFiles = useCallback(
    async (input: FileList | File[]) => {
      const files = Array.from(input)
      if (files.length === 0) return

      if (uploadingRef.current) {
        toast({
          title: 'Загрузка уже идёт',
          description: 'Дождитесь завершения текущей очереди файлов.',
          variant: 'info',
        })
        return
      }

      uploadingRef.current = true
      setIsUploading(true)

      const total = files.length
      let added = 0
      let failed = 0
      const issues: string[] = []

      try {
        setProgress({ current: 0, total, label: 'Подготовка файлов…' })

        for (let index = 0; index < files.length; index += 1) {
          const file = files[index]
          if (!file) continue

          if (mountedRef.current) {
            setProgress({ current: index, total, label: `«${file.name}»` })
          }

          try {
            await createTrackFromFile(file, (label) => {
              if (mountedRef.current) setProgress({ current: index, total, label })
            })
            added += 1
          } catch (caught) {
            failed += 1
            issues.push(describeFileError(caught))
            console.error(`Не удалось добавить файл «${file.name}»`, caught)
          }

          if (mountedRef.current) {
            setProgress({ current: index + 1, total, label: `«${file.name}»` })
          }
        }

        if (mountedRef.current) {
          setProgress({ current: total, total, label: 'Завершение…' })
        }

        const variant = failed === 0 ? 'success' : added === 0 ? 'error' : 'info'
        toast({
          title: summarize(added, failed),
          description: issues.length > 0 ? issues.slice(0, 3).join(' ') : undefined,
          variant,
        })

        // Постоянное хранилище запрашиваем один раз и молча принимаем отказ.
        void requestPersistence()
        await refresh()
      } finally {
        uploadingRef.current = false
        if (mountedRef.current) {
          setIsUploading(false)
          setProgress(null)
        }
      }
    },
    [refresh, toast],
  )

  return { uploadFiles, progress, isUploading }
}
