import { Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getCoverGradient, getCoverLetter } from '@/components/library/format'
import { IconButton, Spinner } from '@/components/ui'
import {
  usePlayerControls,
  usePlayerProgress,
  usePlayerTrack,
} from '@/context/PlayerContext'
import { useBlobUrl } from '@/hooks/useBlobUrl'
import { formatBpmValue, formatDuration, formatMusicalKeyValue } from '@/lib/format'
import { FullPlayerDialog } from './FullPlayerDialog'
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
  const [fullOpen, setFullOpen] = useState(false)
  const closeFull = useCallback(() => setFullOpen(false), [])

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
      className="!h-10 !w-10 !min-h-10 !min-w-10 rounded-full"
      disabled={loading}
      onClick={togglePlay}
    >
      {loading ? (
        <Spinner size="md" label="Загрузка трека" />
      ) : isPlaying ? (
        <Pause className="h-4 w-4 fill-current" aria-hidden="true" />
      ) : (
        <Play className="h-4 w-4 fill-current" aria-hidden="true" />
      )}
    </IconButton>
  )

  const renderTransportButtons = () => (
    <>
      <IconButton label="Предыдущий трек" variant="ghost" size="toolbar" className="rounded-full" onClick={prev}>
        <SkipBack className="h-4 w-4 fill-current" aria-hidden="true" />
      </IconButton>
      {renderPlayButton()}
      <IconButton label="Следующий трек" variant="ghost" size="toolbar" className="rounded-full" disabled={!canGoNext} onClick={next}>
        <SkipForward className="h-4 w-4 fill-current" aria-hidden="true" />
      </IconButton>
    </>
  )

  return (
    <footer
      aria-label="Плеер"
      className="relative mx-2 mb-2 shrink-0 overflow-hidden rounded-card border border-hairline px-3 pt-3 pb-[max(0.375rem,env(safe-area-inset-bottom))] shadow-float sm:mx-3 sm:min-h-[4.5rem] sm:px-4 sm:pt-3 sm:pb-[max(0.375rem,env(safe-area-inset-bottom))]"
    >
      {/* Подложка без backdrop-filter: размытие захватывало оранжевую кнопку play и давало полосу со свечением */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-white/[0.04] bg-gradient-to-br from-white/[0.07] to-transparent"
      />

      <div className="relative flex h-full flex-col justify-center gap-1.5 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,34rem)_minmax(0,1fr)] sm:grid-rows-[auto_auto] sm:items-center sm:gap-x-4 sm:gap-y-0.5">
        {/* Слева: обложка и текущий трек — по центру высоты отсека */}
        <div className="flex min-w-0 flex-col justify-center sm:col-start-1 sm:row-span-2 sm:row-start-1 sm:self-center sm:-translate-y-[3px]">
        <button
          type="button"
          aria-label={`Открыть плеер: ${currentTrack.name}`}
          onClick={() => setFullOpen(true)}
          className="group/info flex min-w-0 items-center justify-center gap-2 rounded-control text-left outline-offset-4 sm:justify-start sm:gap-3"
        >
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-chip border border-hairline bg-bg-subtle text-text-muted transition-[filter] group-hover/info:brightness-110 sm:h-11 sm:w-11 sm:rounded-control">
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
              className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-black/20"
            />
          </span>

          <span className="block min-w-0 max-w-[70%] flex-none sm:max-w-none sm:flex-1">
            <span
              className="block truncate text-body font-medium text-text transition-colors group-hover/info:text-accent"
              title={currentTrack.name}
            >
              {currentTrack.name}
            </span>
            {!error && (
              <span className="hidden truncate text-caption text-text-muted sm:block">
                {loading ? (
                  'Загрузка…'
                ) : (
                  <>
                    {currentTrack.author ? `${currentTrack.author} · ` : ''}
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
              </span>
            )}
          </span>
        </button>
        {error && (
          <p role="alert" className="truncate text-caption text-danger" title={error}>
            {error}
          </p>
        )}
        </div>

        {/* По центру: транспорт с мягким акцентным ореолом. На широких экранах
            кнопки поднимаются в зону между верхней границей и полосой перемотки. */}
        <div className="relative flex min-w-0 items-center justify-center self-center sm:col-start-2 sm:row-start-1">
          <div className="relative flex items-center gap-2 sm:gap-3">{renderTransportButtons()}</div>
        </div>

        {/* Справа: громкость, а под ней — BPM и тональность */}
        <div className="hidden min-w-0 flex-col items-stretch gap-1 sm:col-start-3 sm:justify-self-end lg:min-w-[130px] sm:row-span-2 sm:row-start-1 sm:flex sm:self-center sm:-translate-y-[3px]">
          <div className="flex w-0 min-w-full items-center">
            <IconButton
              label={muted ? 'Включить звук' : 'Выключить звук'}
              variant="ghost"
              size="toolbar"
              className="rounded-full"
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
              size="lg"
              valueText={`${Math.round(volume * 100)}%`}
              onChange={setVolume}
              className="min-w-0 flex-1"
            />
          </div>

          <TempoKeyModule
            bpm={currentTrack.bpm}
            musicalKey={currentTrack.musicalKey}
            evenHalves
            className="translate-x-2"
          />
        </div>

        {/* Полоса перемотки: по центру под транспортом, время по краям, как в макете.
            На широких экранах она вынесена из потока к нижней кромке — тогда обложка,
            транспорт и громкость стоят ровно по центру высоты отсека. */}
        <div className="pointer-events-none flex items-center gap-2 sm:col-start-2 sm:row-start-2 sm:w-full">
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

      {fullOpen && <FullPlayerDialog open onClose={closeFull} />}
    </footer>
  )
}
