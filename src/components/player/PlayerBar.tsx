import { Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { getCoverGradient, getCoverLetter } from '@/components/library/format'
import { IconButton, Spinner } from '@/components/ui'
import {
  usePlayerControls,
  usePlayerProgress,
  usePlayerTrack,
} from '@/context/PlayerContext'
import { useBlobUrl } from '@/hooks/useBlobUrl'
import { formatBpmValue, formatDuration, formatMusicalKeyValue } from '@/lib/format'
import { PlayerSlider } from './PlayerSlider'
import { TempoKeyModule } from './TempoKeyModule'

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
  const { togglePlay, next, prev, seekTo, setVolume } = usePlayerControls()
  const cover = useBlobUrl(currentTrack?.coverFileId)

  const lastAudibleVolumeRef = useRef(volume > 0 ? volume : 1)

  useEffect(() => {
    if (volume > 0) lastAudibleVolumeRef.current = volume
  }, [volume])

  useEffect(() => {
    // Без выбранного трека полосы на экране нет — пробел оставляем странице.
    if (!currentTrack) return

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
  }, [togglePlay, currentTrack])

  // Пока ничего не играет, полоса плеера не рендерится и не занимает место.
  if (!currentTrack) return null

  const duration = durationSec > 0 ? durationSec : (currentTrack.durationSec ?? 0)
  const position = duration > 0 ? Math.min(positionSec, duration) : positionSec
  const queueIndex = queue.findIndex((track) => track.id === currentTrack.id)
  const canGoNext =
    queueIndex >= 0 &&
    queue.slice(queueIndex + 1).some((track) => track.audioFileId !== null)
  const muted = volume === 0

  const toggleMute = () => {
    setVolume(muted ? lastAudibleVolumeRef.current || DEFAULT_AUDIBLE_VOLUME : 0)
  }

  const renderPlayButton = () => (
    <IconButton
      label={isPlaying ? 'Пауза' : 'Воспроизвести'}
      variant="key-accent"
      size="md"
      disabled={loading}
      onClick={togglePlay}
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
      <IconButton label="Предыдущий трек" variant="key" onClick={prev}>
        <SkipBack className="h-5 w-5" aria-hidden="true" />
      </IconButton>
      {renderPlayButton()}
      <IconButton label="Следующий трек" variant="key" disabled={!canGoNext} onClick={next}>
        <SkipForward className="h-5 w-5" aria-hidden="true" />
      </IconButton>
    </>
  )

  return (
    <footer
      aria-label="Плеер"
      className="relative shrink-0 overflow-hidden rounded-t-card border border-divider/40 border-b-0 px-3 py-1 shadow-bevel sm:min-h-player sm:px-4"
    >
      {/* Стеклянный слой: полупрозрачный градиент вместо плотной заливки */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-surface-raised/45 via-surface-raised/25 to-bg/75 backdrop-blur-2xl"
      />
      {/* Тёплая искра по верхней кромке отсека */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent"
      />

      <div className="relative flex h-full flex-col justify-center gap-1.5 sm:grid sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:grid-rows-[auto_auto] sm:items-center sm:gap-x-3 sm:gap-y-1">
        {/* Слева: обложка и текущий трек — по центру высоты отсека */}
        <div className="flex min-w-0 items-center justify-center gap-2 sm:justify-start sm:gap-3 sm:self-center">
          <div className="fl-inset relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-chip border border-border/70 text-text-muted sm:h-16 sm:w-16 sm:rounded-control">
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
            {/* Блик поверх обложки */}
            <span
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-br from-white/15 via-transparent to-black/35"
            />
          </div>

          <div className="min-w-0 max-w-[70%] flex-none sm:max-w-none sm:flex-1">
            <p className="truncate text-body font-medium text-text" title={currentTrack.name}>
              {currentTrack.name}
            </p>
            {error ? (
              <p role="alert" className="truncate text-caption text-danger" title={error}>
                {error}
              </p>
            ) : (
              <p className="hidden truncate font-mono text-caption text-text-muted sm:block">
                {loading ? (
                  'Загрузка…'
                ) : (
                  <>
                    {currentTrack.genre || 'Без жанра'}
                    {(currentTrack.bpm !== null || currentTrack.musicalKey !== null) && (
                      <span className="sm:hidden">
                        {' · '}
                        {formatBpmValue(currentTrack.bpm)} BPM ·{' '}
                        {formatMusicalKeyValue(currentTrack.musicalKey)}
                      </span>
                    )}
                  </>
                )}
              </p>
            )}
          </div>
        </div>

        {/* По центру: транспорт с мягким акцентным ореолом. На широких экранах
            кнопки поднимаются в зону между верхней границей и полосой перемотки. */}
        <div className="relative flex min-w-0 items-center justify-center self-center min-[900px]:mt-0.5 min-[900px]:self-start">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute h-16 w-44 rounded-full bg-accent/10 blur-2xl"
          />
          <div className="relative flex items-center gap-4">{renderTransportButtons()}</div>
        </div>

        {/* Справа: громкость, а под ней — BPM и тональность */}
        <div className="hidden min-w-0 flex-col items-end gap-2 sm:flex sm:self-center">
          <div className="flex min-w-0 items-center gap-2.5">
            <IconButton
              label={muted ? 'Включить звук' : 'Выключить звук'}
              variant="key"
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
              onChange={setVolume}
              className="w-12 min-w-0 shrink md:w-20"
            />
            <span className="hidden shrink-0 text-left font-mono text-mono-badge tabular-nums text-text-muted md:block">
              {Math.round(volume * 100)}%
            </span>
          </div>

          <TempoKeyModule bpm={currentTrack.bpm} musicalKey={currentTrack.musicalKey} />
        </div>

        {/* Полоса перемотки: по центру под транспортом, время по краям, как в макете.
            На широких экранах она вынесена из потока к нижней кромке — тогда обложка,
            транспорт и громкость стоят ровно по центру высоты отсека. */}
        <div className="pointer-events-none flex items-center gap-2 sm:col-span-3 sm:mx-auto sm:w-full sm:max-w-[min(46rem,calc(100vw-23rem))] min-[900px]:absolute min-[900px]:inset-x-0 min-[900px]:bottom-0">
          <span className="w-12 shrink-0 font-mono text-mono-badge tabular-nums text-text-muted">
            {formatDuration(position)}
          </span>
          <PlayerSlider
            value={position}
            max={duration > 0 ? duration : 1}
            step={SEEK_STEP_SEC}
            label="Прогресс воспроизведения"
            valueText={`${formatDuration(position)} из ${formatDuration(duration)}`}
            disabled={duration <= 0}
            onChange={seekTo}
            className="pointer-events-auto min-w-0 flex-1"
          />
          <span className="w-12 shrink-0 text-right font-mono text-mono-badge tabular-nums text-text-muted">
            {formatDuration(duration)}
          </span>
        </div>
      </div>
    </footer>
  )
}
