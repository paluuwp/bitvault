/* eslint-disable react-refresh/only-export-components -- провайдер и хуки по плану живут в одном файле */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { STORAGE_KEYS, getFileUrl, recordPlay } from '@/lib'
import type { FileUrlHandle, Track } from '@/types/models'

const DEFAULT_VOLUME = 1
const PLAYBACK_ERROR = 'Не удалось воспроизвести файл'

export interface PlayerTrackState {
  currentTrack: Track | null
  queue: Track[]
  isPlaying: boolean
  loading: boolean
  error: string | null
}

export interface PlayerProgressState {
  positionSec: number
  durationSec: number
  volume: number
}

export interface PlayerControlsValue {
  /** Загружает и запускает трек; без аудиофайла ничего не делает. */
  playTrack: (track: Track, queue?: Track[]) => void
  togglePlay: () => void
  seekTo: (seconds: number) => void
  /** Следующий трек очереди; на последнем треке ничего не делает. */
  next: () => void
  /** Предыдущий трек очереди; на первом треке перематывает в начало. */
  prev: () => void
  setVolume: (value: number) => void
  /** Полностью останавливает воспроизведение и освобождает объектный URL. */
  stop: () => void
  /** Убирает трек из очереди, например после удаления из библиотеки. */
  removeFromQueue: (trackId: string) => void
  /** Обновляет данные трека в плеере и очереди после редактирования. */
  syncTrack: (track: Track) => void
}

const PlayerTrackContext = createContext<PlayerTrackState | null>(null)
const PlayerProgressContext = createContext<PlayerProgressState | null>(null)
const PlayerControlsContext = createContext<PlayerControlsValue | null>(null)

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** Ищет ближайший трек с аудио в очереди, пропуская проекты без звука. */
function findPlayable(tracks: Track[], from: number, step: 1 | -1): Track | undefined {
  for (let index = from + step; index >= 0 && index < tracks.length; index += step) {
    const candidate = tracks[index]
    if (candidate && candidate.audioFileId !== null) return candidate
  }
  return undefined
}

function readStoredVolume(): number {
  if (typeof window === 'undefined') return DEFAULT_VOLUME
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.volume)
    if (raw === null) return DEFAULT_VOLUME
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return DEFAULT_VOLUME
    return clamp(parsed, 0, 1)
  } catch {
    return DEFAULT_VOLUME
  }
}

function writeStoredVolume(value: number): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEYS.volume, String(value))
  } catch {
    // Хранилище может быть недоступно — громкость просто не запомнится.
  }
}

export function PlayerProvider({
  children,
  onTrackPlayed,
}: {
  children: ReactNode
  /** Вызывается с обновлённой записью трека после учёта прослушивания. */
  onTrackPlayed?: (track: Track) => void
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlHandleRef = useRef<FileUrlHandle | null>(null)
  const loadIdRef = useRef(0)
  const recordedTrackIdRef = useRef<string | null>(null)
  const currentTrackRef = useRef<Track | null>(null)
  const queueRef = useRef<Track[]>([])
  const durationRef = useRef(0)

  const [currentTrack, setCurrentTrack] = useState<Track | null>(null)
  const [queue, setQueue] = useState<Track[]>([])
  const [isPlaying, setIsPlaying] = useState(false)
  const [positionSec, setPositionSec] = useState(0)
  const [durationSec, setDurationSec] = useState(0)
  const [volume, setVolumeState] = useState(readStoredVolume)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const volumeRef = useRef(volume)
  const onTrackPlayedRef = useRef(onTrackPlayed)
  onTrackPlayedRef.current = onTrackPlayed

  const releaseUrl = useCallback(() => {
    urlHandleRef.current?.revoke()
    urlHandleRef.current = null
  }, [])

  const reportPlaybackError = useCallback(() => {
    setIsPlaying(false)
    setLoading(false)
    setPositionSec(0)
    setError(PLAYBACK_ERROR)
  }, [])

  const playTrack = useCallback(
    (track: Track, nextQueue?: Track[]) => {
      const fileId = track.audioFileId
      if (fileId === null) return

      const audio = audioRef.current
      if (!audio) return

      // Тот же трек: обновляем очередь и продолжаем с текущей позиции.
      if (currentTrackRef.current?.id === track.id) {
        if (nextQueue) {
          queueRef.current = nextQueue
          setQueue(nextQueue)
        }
        if (audio.paused) {
          void audio.play().catch(() => setIsPlaying(false))
        }
        return
      }

      const loadId = loadIdRef.current + 1
      loadIdRef.current = loadId

      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      releaseUrl()
      recordedTrackIdRef.current = null

      const tracks = nextQueue ?? queueRef.current
      queueRef.current = tracks
      currentTrackRef.current = track
      setQueue(tracks)
      setCurrentTrack(track)
      setLoading(true)
      setError(null)
      setPositionSec(0)
      durationRef.current = track.durationSec ?? 0
      setDurationSec(track.durationSec ?? 0)

      void (async () => {
        try {
          const handle = await getFileUrl(fileId)
          if (loadId !== loadIdRef.current) {
            handle.revoke()
            return
          }

          urlHandleRef.current = handle
          audio.src = handle.url
          audio.volume = volumeRef.current
          audio.load()
          setLoading(false)

          try {
            await audio.play()
          } catch {
            if (loadId === loadIdRef.current) setIsPlaying(false)
          }
        } catch {
          if (loadId !== loadIdRef.current) return
          setLoading(false)
          setError(PLAYBACK_ERROR)
        }
      })()
    },
    [releaseUrl],
  )

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !currentTrackRef.current) return

    if (audio.paused) {
      if (!audio.src) return
      void audio.play().catch(() => setIsPlaying(false))
      return
    }

    audio.pause()
  }, [])

  const seekTo = useCallback((seconds: number) => {
    const audio = audioRef.current
    if (!audio || !currentTrackRef.current) return

    const limit =
      Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : durationRef.current
    const target = limit > 0 ? clamp(seconds, 0, limit) : Math.max(seconds, 0)
    audio.currentTime = target
    setPositionSec(target)
  }, [])

  const playNext = useCallback(() => {
    const track = currentTrackRef.current
    if (!track) return

    const tracks = queueRef.current
    const index = tracks.findIndex((item) => item.id === track.id)
    const target = index >= 0 ? findPlayable(tracks, index, 1) : undefined
    if (target) playTrack(target, tracks)
  }, [playTrack])

  const playPrev = useCallback(() => {
    const track = currentTrackRef.current
    if (!track) return

    const tracks = queueRef.current
    const index = tracks.findIndex((item) => item.id === track.id)
    if (index > 0) {
      const target = findPlayable(tracks, index, -1)
      if (target) playTrack(target, tracks)
      return
    }

    seekTo(0)
  }, [playTrack, seekTo])

  const setVolume = useCallback((value: number) => {
    const next = clamp(value, 0, 1)
    volumeRef.current = next
    setVolumeState(next)
    if (audioRef.current) audioRef.current.volume = next
    writeStoredVolume(next)
  }, [])

  const stop = useCallback(() => {
    loadIdRef.current += 1
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }

    releaseUrl()
    recordedTrackIdRef.current = null
    currentTrackRef.current = null
    queueRef.current = []
    durationRef.current = 0
    setCurrentTrack(null)
    setQueue([])
    setIsPlaying(false)
    setPositionSec(0)
    setDurationSec(0)
    setLoading(false)
    setError(null)
  }, [releaseUrl])

  const removeFromQueue = useCallback((trackId: string) => {
    const nextQueue = queueRef.current.filter((item) => item.id !== trackId)
    if (nextQueue.length === queueRef.current.length) return
    queueRef.current = nextQueue
    setQueue(nextQueue)
  }, [])

  const syncTrack = useCallback((track: Track) => {
    if (currentTrackRef.current?.id === track.id) {
      currentTrackRef.current = track
      setCurrentTrack(track)
    }
    if (queueRef.current.some((item) => item.id === track.id)) {
      const nextQueue = queueRef.current.map((item) => (item.id === track.id ? track : item))
      queueRef.current = nextQueue
      setQueue(nextQueue)
    }
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    audio.volume = volumeRef.current

    const handleTimeUpdate = () => setPositionSec(audio.currentTime)

    const handleDurationChange = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        durationRef.current = audio.duration
        setDurationSec(audio.duration)
      }
    }

    const handlePlay = () => {
      setIsPlaying(true)
      setError(null)

      const track = currentTrackRef.current
      if (!track) return
      if (recordedTrackIdRef.current === track.id) return
      recordedTrackIdRef.current = track.id
      // Учёт прослушивания не должен влиять на воспроизведение.
      void recordPlay(track.id)
        .then((updated) => {
          onTrackPlayedRef.current?.(updated)
        })
        .catch(() => undefined)
    }

    const handlePause = () => setIsPlaying(false)

    const handleEnded = () => {
      setIsPlaying(false)

      const track = currentTrackRef.current
      const tracks = queueRef.current
      const index = track ? tracks.findIndex((item) => item.id === track.id) : -1
      const target = index >= 0 ? findPlayable(tracks, index, 1) : undefined
      if (target) {
        playTrack(target, tracks)
        return
      }

      const duration =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : durationRef.current
      setPositionSec(duration)
    }

    const handleError = () => {
      // Код 1 — прерванная загрузка; при смене трека это не ошибка для пользователя.
      if (!currentTrackRef.current || !audio.error || audio.error.code === 1) return
      reportPlaybackError()
    }

    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('durationchange', handleDurationChange)
    audio.addEventListener('loadedmetadata', handleDurationChange)
    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('error', handleError)

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('durationchange', handleDurationChange)
      audio.removeEventListener('loadedmetadata', handleDurationChange)
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('error', handleError)
    }
  }, [playTrack, reportPlaybackError])

  useEffect(() => {
    const audio = audioRef.current
    return () => {
      loadIdRef.current += 1
      if (audio) {
        audio.pause()
        audio.removeAttribute('src')
      }
      urlHandleRef.current?.revoke()
      urlHandleRef.current = null
    }
  }, [])

  const trackState = useMemo<PlayerTrackState>(
    () => ({ currentTrack, queue, isPlaying, loading, error }),
    [currentTrack, queue, isPlaying, loading, error],
  )

  const progressState = useMemo<PlayerProgressState>(
    () => ({ positionSec, durationSec, volume }),
    [positionSec, durationSec, volume],
  )

  const controls = useMemo<PlayerControlsValue>(
    () => ({
      playTrack,
      togglePlay,
      seekTo,
      next: playNext,
      prev: playPrev,
      setVolume,
      stop,
      removeFromQueue,
      syncTrack,
    }),
    [playTrack, togglePlay, seekTo, playNext, playPrev, setVolume, stop, removeFromQueue, syncTrack],
  )

  return (
    <PlayerControlsContext.Provider value={controls}>
      <PlayerTrackContext.Provider value={trackState}>
        <PlayerProgressContext.Provider value={progressState}>
          <audio ref={audioRef} preload="metadata" className="hidden" />
          {children}
        </PlayerProgressContext.Provider>
      </PlayerTrackContext.Provider>
    </PlayerControlsContext.Provider>
  )
}

export function usePlayerTrack(): PlayerTrackState {
  const context = useContext(PlayerTrackContext)
  if (!context) {
    throw new Error('usePlayerTrack должен использоваться внутри PlayerProvider')
  }
  return context
}

export function usePlayerProgress(): PlayerProgressState {
  const context = useContext(PlayerProgressContext)
  if (!context) {
    throw new Error('usePlayerProgress должен использоваться внутри PlayerProvider')
  }
  return context
}

export function usePlayerControls(): PlayerControlsValue {
  const context = useContext(PlayerControlsContext)
  if (!context) {
    throw new Error('usePlayerControls должен использоваться внутри PlayerProvider')
  }
  return context
}
