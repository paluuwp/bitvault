import { useEffect, useState } from 'react'
import { getFileUrl, isAppError } from '@/lib'
import { useOptionalToast } from '@/context/ToastContext'

export interface BlobUrlState {
  url: string | null
  loading: boolean
}

/**
 * Создаёт object URL для файла из локального хранилища и гарантированно
 * освобождает его при размонтировании или смене `fileId`.
 */
export function useBlobUrl(fileId: string | null | undefined): BlobUrlState {
  const [state, setState] = useState<BlobUrlState>({ url: null, loading: false })
  const toast = useOptionalToast()?.toast

  useEffect(() => {
    if (!fileId) {
      setState({ url: null, loading: false })
      return
    }

    let cancelled = false
    let handle: { url: string; revoke: () => void } | null = null

    setState({ url: null, loading: true })

    getFileUrl(fileId)
      .then((nextHandle) => {
        if (cancelled) {
          nextHandle.revoke()
          return
        }
        handle = nextHandle
        setState({ url: nextHandle.url, loading: false })
      })
      .catch((error: unknown) => {
        console.error('Не удалось получить файл для предпросмотра', error)
        if (cancelled) return
        setState({ url: null, loading: false })
        toast?.({
          title: 'Не удалось открыть файл',
          description: isAppError(error)
            ? error.message
            : 'Файл недоступен. Попробуйте открыть его ещё раз.',
          variant: 'error',
        })
      })

    return () => {
      cancelled = true
      handle?.revoke()
      handle = null
    }
  }, [fileId, toast])

  return state
}
