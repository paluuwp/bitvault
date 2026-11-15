import { Music, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { getCoverGradient, getCoverLetter } from '@/components/library/format'
import { IconButton, Spinner } from '@/components/ui'
import {
  usePlayerControls,
  usePlayerProgress,
  usePlayerTrack,
} from '@/context/PlayerContext'
import { useBlobUrl } from '@/hooks/useBlobUrl'
import { formatDuration } from '@/lib/format'
import { PlayerSlider } from './PlayerSlider'

const SEEK_STEP_SEC = 5
const VOLUME_STEP = 0.05
const DEFAULT_AUDIBLE_VOLUME = 0.6

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'A'
}

function hasOpenDialog(): boolean {
  return document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]') !== null
}

export function PlayerBar() {
  const { currentTrack, queue, isPlaying, loading, error } = usePlayerTrack()
  const { positionSec, durationSec, volume } = usePlayerProgress()
  const { togglePlay, seekTo, next, prev, setVolume } = usePlayerControls()
  const cover = useBlobUrl(currentTrack?.coverFileId)

  const lastAudibleVolumeRef = useRef(volume > 0 ? volume : 1)

  useEffect(() => {
    if (volume > 0) lastAudibleVolumeRef.current = volume
  }, [volume])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' && event.key !== ' ') return
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
      // Esc обрабатывают dialog и drawer; при открытом окне пробел не перехватываем.
      if (hasOpenDialog()) return
      if (isTypingTarget(event.target)) return

      event.preventDefault()
      togglePlay()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [togglePlay])

  const hasTrack = currentTrack !== null
  const duration = durationSec > 0 ? durationSec : (currentTrack?.durationSec ?? 0)
  const position = duration > 0 ? Math.min(positionSec, duration) : positionSec
  const queueIndex = currentTrack
    ? queue.findIndex((track) => track.id === currentTrack.id)
    : -1
  const canGoNext =
    queueIndex >= 0 &&
    queue.slice(queueIndex + 1).some((track) => track.audioFileId !== null)
  const muted = volume === 0

  const metaParts: string[] = []
  if (currentTrack?.genre) metaParts.push(currentTrack.genre)
  if (currentTrack?.bpm !== null && currentTrack?.bpm !== undefined) {
    metaParts.push(`${currentTrack.bpm} BPM`)
  }
  const meta = metaParts.join(' · ')

  const toggleMute = () => {
    setVolume(muted ? lastAudibleVolumeRef.current || DEFAULT_AUDIBLE_VOLUME : 0)
  }

  const renderPlayButton = (className?: string) => (
    <IconButton
      label={isPlaying ? 'Пауза' : 'Воспроизвести'}
      variant="play"
      disabled={!hasTrack || loading}
      onClick={togglePlay}
      className={className}
    >
      {loading ? (
        <Spinner size="md" label="Загрузка трека" />
      ) : isPlaying ? (
        <Pause className="h-5 w-5 fill-current" aria-hidden="true" />
      ) : (
        <Play className="h-5 w-5 fill-current" aria-hidden="true" />
      )}
    </IconButton>
  )

  const renderTransportButtons = () => (
    <>
      <IconButton
        label="Предыдущий трек"
        variant="transport"
        disabled={!hasTrack}
        onClick={prev}
      >
        <SkipBack className="h-5 w-5" aria-hidden="true" />
      </IconButton>
      {renderPlayButton()}
      <IconButton
        label="Следующий трек"
        variant="transport"
        disabled={!canGoNext}
        onClick={next}
      >
        <SkipForward className="h-5 w-5" aria-hidden="true" />
      </IconButton>
    </>
  )

  return (
    <footer
      aria-label="Плеер"
      className="shrink-0 border-t border-control-border bg-surface-raised px-3 py-2 shadow-bevel sm:h-player sm:px-4 sm:py-0"
    >
      <div className="flex h-full flex-col justify-center gap-1.5 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3 md:w-sidebar md:flex-none">
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-chip border border-border bg-surface text-text-muted">
            {currentTrack ? (
              <>
                <span
                  aria-hidden="true"
                  className="absolute inset-0"
                  style={{ backgroundImage: getCoverGradient(currentTrack.color) }}
                />
                <span
                  aria-hidden="true"
                  className="relative text-h2 font-semibold text-accent-ink/80 select-none"
                >
                  {getCoverLetter(currentTrack.name)}
                </span>
                {cover.url && (
                  <img
                    src={cover.url}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                )}
              </>
            ) : (
              <Music className="h-5 w-5" aria-hidden="true" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-body font-medium text-text" title={currentTrack?.name}>
              {currentTrack?.name ?? 'Ничего не играет'}
            </p>
            {error && currentTrack ? (
              <p role="alert" className="truncate text-caption text-danger" title={error}>
                {error}
              </p>
            ) : (
              <p className="hidden truncate font-mono text-caption text-text-muted sm:block">
                {currentTrack
                  ? loading
                    ? 'Загрузка…'
                    : meta || 'Без жанра'
                  : 'Выберите бит в библиотеке'}
              </p>
            )}
          </div>

          <div className="ml-auto flex items-center gap-1 sm:hidden">
            {renderTransportButtons()}
          </div>
        </div>

        <div className="flex w-full flex-col items-center gap-1 sm:flex-1">
          <div className="hidden items-center gap-1 sm:flex">
            {renderTransportButtons()}
          </div>

          <div className="flex w-full max-w-xl items-center gap-2">
            <span className="w-11 shrink-0 text-right font-mono text-mono-badge text-text-muted">
              {formatDuration(hasTrack ? position : 0)}
            </span>
            <PlayerSlider
              value={position}
              max={duration > 0 ? duration : 1}
              step={SEEK_STEP_SEC}
              label="Прогресс воспроизведения"
              valueText={`${formatDuration(position)} из ${formatDuration(duration)}`}
              disabled={!hasTrack || duration <= 0}
              onChange={seekTo}
              className="flex-1"
            />
            <span className="w-11 shrink-0 font-mono text-mono-badge text-text-muted">
              {formatDuration(hasTrack ? duration : 0)}
            </span>
          </div>
        </div>

        <div className="hidden shrink-0 items-center gap-2 sm:flex md:w-[200px] md:justify-end">
          <IconButton
            label={muted ? 'Включить звук' : 'Выключить звук'}
            disabled={!hasTrack}
            onClick={toggleMute}
          >
            {muted ? (
              <VolumeX className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Volume2 className="h-5 w-5" aria-hidden="true" />
            )}
          </IconButton>
          <PlayerSlider
            value={volume}
            max={1}
            step={VOLUME_STEP}
            label="Громкость"
            valueText={`${Math.round(volume * 100)}%`}
            disabled={!hasTrack}
            onChange={setVolume}
            className="w-24"
          />
        </div>
      </div>
    </footer>
  )
}
