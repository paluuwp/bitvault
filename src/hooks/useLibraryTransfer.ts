import { useCallback, useEffect, useRef, useState } from 'react'
import { exportLibrary, getStorageInfo, importLibrary, isAppError } from '@/lib'
import { exportFileName } from '@/lib/exportImport'
import type { ImportResult, TransferProgress } from '@/types/models'

export type ImportMode = 'merge' | 'replace'

const LARGE_LIBRARY_BYTES = 1024 * 1024 * 1024

export interface UseLibraryTransferResult {
  exporting: boolean
  importing: boolean
  progress: TransferProgress | null
  errorMessage: string | null
  warningMessage: string | null
  /** Создаёт ZIP-архив библиотеки и запускает скачивание. */
  exportToFile: () => Promise<void>
  /** Импортирует архив; при ошибке возвращает null и заполняет errorMessage. */
  importFromFile: (
    file: File,
    mode: ImportMode,
    onBeforeWrite?: () => void,
  ) => Promise<ImportResult | null>
  clearMessages: () => void
}

function describeError(error: unknown): string {
  if (isAppError(error)) return error.message
  return 'Не удалось выполнить операцию. Повторите попытку.'
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Даём браузеру время начать скачивание, затем освобождаем object URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function useLibraryTransfer(): UseLibraryTransferResult {
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<TransferProgress | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [warningMessage, setWarningMessage] = useState<string | null>(null)

  const busyRef = useRef(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const clearMessages = useCallback(() => {
    setErrorMessage(null)
    setWarningMessage(null)
  }, [])

  const exportToFile = useCallback(async () => {
    if (busyRef.current) return
    busyRef.current = true
    setExporting(true)
    setErrorMessage(null)
    setWarningMessage(null)
    setProgress(null)

    try {
      const storage = await getStorageInfo()
      if (mountedRef.current && storage.usage !== null && storage.usage > LARGE_LIBRARY_BYTES) {
        setWarningMessage('Библиотека занимает больше 1 ГБ — экспорт может занять время.')
      }

      const blob = await exportLibrary((next) => {
        if (mountedRef.current) setProgress(next)
      })
      if (!mountedRef.current) return
      downloadBlob(blob, exportFileName())
    } catch (caught) {
      if (mountedRef.current) setErrorMessage(describeError(caught))
    } finally {
      busyRef.current = false
      if (mountedRef.current) {
        setExporting(false)
        setProgress(null)
      }
    }
  }, [])

  const importFromFile = useCallback(
    async (file: File, mode: ImportMode, onBeforeWrite?: () => void) => {
      if (busyRef.current) return null
      busyRef.current = true
      setImporting(true)
      setErrorMessage(null)
      setWarningMessage(null)
      setProgress(null)

      try {
        const result = await importLibrary(
          file,
          { mode, onBeforeWrite },
          (next) => {
            if (mountedRef.current) setProgress(next)
          },
        )
        return result
      } catch (caught) {
        if (mountedRef.current) setErrorMessage(describeError(caught))
        return null
      } finally {
        busyRef.current = false
        if (mountedRef.current) {
          setImporting(false)
          setProgress(null)
        }
      }
    },
    [],
  )

  return {
    exporting,
    importing,
    progress,
    errorMessage,
    warningMessage,
    exportToFile,
    importFromFile,
    clearMessages,
  }
}
