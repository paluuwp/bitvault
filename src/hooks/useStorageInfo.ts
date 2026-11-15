import { useCallback, useEffect, useRef, useState } from 'react'
import { getStorageInfo, requestPersistence as requestPersistenceRequest } from '@/lib'
import type { StorageInfo } from '@/types/models'

export interface UseStorageInfoResult {
  info: StorageInfo | null
  loading: boolean
  /** Перечитывает оценку хранилища; вызывается после загрузок, удалений и импорта. */
  refresh: () => Promise<void>
  /** Запрашивает постоянное хранение и обновляет статус. */
  requestPersistence: () => Promise<boolean>
}

export function useStorageInfo(): UseStorageInfoResult {
  const [info, setInfo] = useState<StorageInfo | null>(null)
  const [loading, setLoading] = useState(true)

  const mountedRef = useRef(true)
  const requestIdRef = useRef(0)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const refresh = useCallback(async () => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setLoading(true)

    try {
      const next = await getStorageInfo()
      if (!mountedRef.current || requestId !== requestIdRef.current) return
      setInfo(next)
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const requestPersistence = useCallback(async () => {
    const granted = await requestPersistenceRequest()
    await refresh()
    return granted
  }, [refresh])

  return { info, loading, refresh, requestPersistence }
}
