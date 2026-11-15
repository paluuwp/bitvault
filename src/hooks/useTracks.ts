import { useCallback, useEffect, useRef, useState } from 'react'
import {
  isAppError,
  listTracks,
  toAppError,
  toggleFavorite as toggleFavoriteRequest,
  updateTrack as updateTrackRequest,
} from '@/lib'
import type { AppError } from '@/lib'
import type { Track, TrackPatch } from '@/types/models'
import { useToast } from '@/context/ToastContext'

export interface UseTracksResult {
  tracks: Track[]
  loading: boolean
  error: AppError | null
  /** Перечитывает библиотеку из локального хранилища. */
  refresh: () => Promise<void>
  /** Заменяет трек в локальном состоянии (после сохранения или удаления). */
  applyTrackUpdate: (track: Track) => void
  removeTrack: (id: string) => void
  /** Оптимистично переключает избранное; при ошибке откатывает состояние. */
  toggleFavorite: (id: string) => Promise<void>
  /** Сохраняет изменения через слой данных; ошибка пробрасывается вызывающему. */
  updateTrack: (id: string, patch: TrackPatch) => Promise<Track>
}

function describeError(error: unknown): string {
  return isAppError(error) ? error.message : 'Повторите попытку позже.'
}

/** Подсказка для ошибок, которые пользователь может исправить сам. */
function describeLoadError(error: AppError): string {
  if (error.code === 'DB_UNAVAILABLE') {
    return 'Браузер не даёт доступ к локальному хранилищу. Отключите приватный режим или разрешите IndexedDB и повторите попытку.'
  }
  return error.message
}

export function useTracks(): UseTracksResult {
  const { toast } = useToast()
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<AppError | null>(null)

  const mountedRef = useRef(true)
  const requestIdRef = useRef(0)
  const tracksRef = useRef<Track[]>([])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    tracksRef.current = tracks
  }, [tracks])

  const applyTrackUpdate = useCallback((track: Track) => {
    setTracks((previous) => {
      const exists = previous.some((item) => item.id === track.id)
      if (!exists) return [track, ...previous]
      return previous.map((item) => (item.id === track.id ? track : item))
    })
  }, [])

  const removeTrack = useCallback((id: string) => {
    setTracks((previous) => previous.filter((item) => item.id !== id))
  }, [])

  const refresh = useCallback(async () => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setLoading(true)

    try {
      const nextTracks = await listTracks()
      if (!mountedRef.current || requestId !== requestIdRef.current) return
      setTracks(nextTracks)
      setError(null)
    } catch (caught) {
      const appError = toAppError(caught)
      if (!mountedRef.current || requestId !== requestIdRef.current) return
      setError(appError)
      console.error('Не удалось загрузить библиотеку', caught)
      toast({
        title: 'Не удалось загрузить библиотеку',
        description: describeLoadError(appError),
        variant: 'error',
      })
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setLoading(false)
      }
    }
  }, [toast])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const toggleFavorite = useCallback(
    async (id: string) => {
      const target = tracksRef.current.find((track) => track.id === id)
      if (!target) return

      const nextFavorite = !target.isFavorite
      setTracks((previous) =>
        previous.map((track) =>
          track.id === id ? { ...track, isFavorite: nextFavorite } : track,
        ),
      )

      try {
        const updated = await toggleFavoriteRequest(id)
        if (!mountedRef.current) return
        applyTrackUpdate(updated)
        toast({
          title: updated.isFavorite ? 'Добавлено в избранное' : 'Удалено из избранного',
          description: `«${updated.name}»`,
          variant: 'success',
        })
      } catch (caught) {
        if (!mountedRef.current) return
        setTracks((previous) =>
          previous.map((track) =>
            track.id === id ? { ...track, isFavorite: target.isFavorite } : track,
          ),
        )
        console.error('Не удалось изменить избранное', caught)
        toast({
          title: 'Не удалось изменить избранное',
          description: describeError(caught),
          variant: 'error',
        })
      }
    },
    [applyTrackUpdate, toast],
  )

  const updateTrack = useCallback(
    async (id: string, patch: TrackPatch): Promise<Track> => {
      try {
        const updated = await updateTrackRequest(id, patch)
        if (mountedRef.current) applyTrackUpdate(updated)
        return updated
      } catch (caught) {
        const appError = toAppError(caught)
        console.error('Не удалось сохранить изменения трека', caught)
        toast({
          title: 'Не удалось сохранить изменения',
          description: appError.message,
          variant: 'error',
        })
        throw appError
      }
    },
    [applyTrackUpdate, toast],
  )

  return {
    tracks,
    loading,
    error,
    refresh,
    applyTrackUpdate,
    removeTrack,
    toggleFavorite,
    updateTrack,
  }
}
