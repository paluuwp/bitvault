import { Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { getCoverGradient, getCoverLetter } from '@/components/library/format'
import { IconButton, Modal, Spinner } from '@/components/ui'
import {
  usePlayerControls,
  usePlayerProgress,
  usePlayerTrack,
} from '@/context/PlayerContext'
import { useBlobUrl } from '@/hooks/useBlobUrl'
import { useWaveform } from '@/hooks/useWaveform'
import { formatDuration } from '@/lib/format'
import { PlayerSlider } from './PlayerSlider'
import { TempoKeyModule } from './TempoKeyModule'
import { WaveformSeek } from './WaveformSeek'

const SEEK_STEP_SEC = 5
const VOLUME_STEP = 0.05
const DEFAULT_AUDIBLE_VOLUME = 0.6
const WAVE_BARS = 240

export interface FullPlayerDialogProps {
  open: boolean
  onClose: () => void
}

/** Полноценное окно плеера: обложка, волна, транспорт, громкость, BPM и тональность. */
export function FullPlayerDialog({ open, onClose }: FullPlayerDialogProps) {
  const { currentTrack, queue, isPlaying, loading, error } = usePlayerTrack()
  const { positionSec, durationSec, volume } = usePlayerProgress()
  const { togglePlay, next, prev, seekTo, setVolume } = usePlayerControls()
  const cover = useBlobUrl(open ? currentTrack?.coverFileId : null)
  const { peaks } = useWaveform(
    open ? currentTrack?.audioFileId : null,
    WAVE_BARS,
    currentTrack?.durationSec ?? undefined,
  )

  const lastAudibleVolumeRef = useRef(volume > 0 ? volume : 1)
  useEffect(() => {
    if (volume > 0) lastAudibleVolumeRef.current = volume
  }, [volume])

  // Нет трека — показывать нечего, закрываем окно.
  const hasTrack = currentTrack !== null
  useEffect(() => {
    if (open && !hasTrack) onClose()
  }, [open, hasTrack, onClose])

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

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={currentTrack.name}
      hideTitle
      size="xl"
      closeLabel="Закрыть плеер"
    >
      <div className="relative -mx-5 -my-4 overflow-hidden px-5 py-6">
        {/* Подсветка цветом обложки */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-20 blur-3xl"
          style={{ backgroundImage: getCoverGradient(currentTrack.color) }}
        />

        <div className="relative flex flex-col gap-6">
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
            <div className="relative flex h-44 w-44 shrink-0 items-center justify-center overflow-hidden rounded-card border border-hairline bg-bg-subtle shadow-float sm:h-52 sm:w-52">
              <span
                aria-hidden="true"
                className="absolute inset-0"
                style={{ backgroundImage: getCoverGradient(currentTrack.color) }}
              />
              <span
                aria-hidden="true"
                className="relative text-display font-semibold text-accent-ink/80 select-none"
              >
                {getCoverLetter(currentTrack.name)}
              </span>
              {cover.url && (
                <img src={cover.url} alt="" className="absolute inset-0 h-full w-full object-cover" />
              )}
              <span
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-black/20"
              />
            </div>

            <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center sm:items-start sm:text-left">
              <p
                aria-hidden="true"
                title={currentTrack.name}
                className="line-clamp-2 w-full break-words text-h1 font-bold text-text sm:text-display"
              >
                {currentTrack.name}
              </p>
              {currentTrack.author && (
                <p className="w-full truncate text-body text-text">{currentTrack.author}</p>
              )}
              <p className="text-body text-text-muted">{currentTrack.genre || 'Без жанра'}</p>
              {error && (
                <p role="alert" className="text-caption text-danger">
                  {error}
                </p>
              )}
              <TempoKeyModule bpm={currentTrack.bpm} musicalKey={currentTrack.musicalKey} />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="w-12 shrink-0 font-mono text-mono-badge tabular-nums text-text-muted">
              {formatDuration(position)}
            </span>
            <WaveformSeek
              value={position}
              max={duration > 0 ? duration : 1}
              step={SEEK_STEP_SEC}
              label="Прогресс воспроизведения"
              valueText={`${formatDuration(position)} из ${formatDuration(duration)}`}
              disabled={duration <= 0}
              onChange={seekTo}
              peaks={peaks}
              height={96}
              className="min-w-0 flex-1"
            />
            <span className="w-12 shrink-0 text-right font-mono text-mono-badge tabular-nums text-text-muted">
              {formatDuration(duration)}
            </span>
          </div>

          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
            <div className="hidden w-40 sm:block" aria-hidden="true" />
            <div className="flex items-center gap-4">
              <IconButton label="Предыдущий трек" variant="ghost" size="toolbar" className="rounded-full" onClick={prev}>
                <SkipBack className="h-5 w-5 fill-current" aria-hidden="true" />
              </IconButton>
              <IconButton
                label={isPlaying ? 'Пауза' : 'Воспроизвести'}
                variant="key-accent"
                size="md"
                className="!h-14 !w-14 !min-h-14 !min-w-14 rounded-full"
                disabled={loading}
                onClick={togglePlay}
              >
                {loading ? (
                  <Spinner size="md" label="Загрузка трека" />
                ) : isPlaying ? (
                  <Pause className="h-6 w-6 fill-current" aria-hidden="true" />
                ) : (
                  <Play className="h-6 w-6 fill-current" aria-hidden="true" />
                )}
              </IconButton>
              <IconButton
                label="Следующий трек"
                variant="ghost"
                size="toolbar"
                className="rounded-full"
                disabled={!canGoNext}
                onClick={next}
              >
                <SkipForward className="h-5 w-5 fill-current" aria-hidden="true" />
              </IconButton>
            </div>
            <div className="flex w-40 items-center gap-2">
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
          </div>
        </div>
      </div>
    </Modal>
  )
}
