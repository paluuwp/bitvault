import { clsx } from 'clsx'
import { FileMusic, Play } from 'lucide-react'
import type { MouseEvent } from 'react'
import { useBlobUrl } from '@/hooks/useBlobUrl'
import { Badge, DropdownMenu, Spinner } from '@/components/ui'
import type { Track } from '@/types/models'
import { FavoriteButton } from './FavoriteButton'
import { formatDuration, formatTrackDate, getCoverGradient, getCoverLetter } from './format'
import { buildTrackMenuItems } from './trackMenu'
import type { TrackMenuAction } from './trackMenu'

export interface TrackRowProps {
  track: Track
  /** Порядковый номер в текущей выборке; показывается в левой колонке. */
  index?: number
  selected?: boolean
  disabled?: boolean
  loading?: boolean
  onPlay?: (track: Track) => void
  onOpen?: (track: Track) => void
  onToggleFavorite?: (track: Track) => void
  onMenuAction?: (track: Track, action: TrackMenuAction) => void
  className?: string
}

export function TrackRow({
  track,
  index,
  selected = false,
  disabled = false,
  loading = false,
  onPlay,
  onOpen,
  onToggleFavorite,
  onMenuAction,
  className,
}: TrackRowProps) {
  const interactive = !disabled && !loading
  const hasAudio = track.audioFileId !== null
  const menuItems = buildTrackMenuItems(track, onMenuAction)
  const cover = useBlobUrl(track.coverFileId)

  const handlePrimaryAction = () => {
    if (hasAudio) {
      onPlay?.(track)
    } else {
      onOpen?.(track)
    }
  }

  const handleRowClick = (event: MouseEvent<HTMLElement>) => {
    if (!interactive || !onOpen) return
    const target = event.target
    if (target instanceof Element && target.closest('button, a, input, textarea, select, [role="menu"]')) {
      return
    }
    onOpen(track)
  }

  return (
    <li
      aria-busy={loading || undefined}
      onClick={handleRowClick}
      className={clsx(
        'group relative flex min-h-16 items-center gap-3 border-b border-border px-3 py-2.5 transition-colors last:border-b-0',
        selected ? 'bg-surface-active' : 'hover:bg-surface-raised focus-within:bg-surface-raised',
        disabled && 'opacity-60',
        onOpen && 'cursor-pointer',
        className,
      )}
    >
      {selected && (
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-accent" />
      )}

      {index !== undefined && (
        <span
          aria-hidden="true"
          className="w-6 shrink-0 text-right font-mono text-mono-badge text-text-subtle"
        >
          {String(index).padStart(2, '0')}
        </span>
      )}

      <button
        type="button"
        disabled={!interactive}
        onClick={handlePrimaryAction}
        aria-label={hasAudio ? `Воспроизвести «${track.name}»` : `Открыть «${track.name}»`}
        className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-control disabled:opacity-40"
      >
        <span
          aria-hidden="true"
          className="absolute inset-0"
          style={{ backgroundImage: getCoverGradient(track.color) }}
        />
        <span
          aria-hidden="true"
          className="relative text-h2 font-semibold text-accent-ink/80 select-none"
        >
          {getCoverLetter(track.name)}
        </span>
        {cover.url && (
          <img src={cover.url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        <span
          aria-hidden="true"
          className={clsx(
            'absolute inset-0 flex items-center justify-center bg-bg/50 transition-opacity motion-reduce:transition-none',
            loading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
          )}
        >
          {loading ? (
            <Spinner size="md" label="Загрузка трека" className="text-text" />
          ) : hasAudio ? (
            <Play className="h-5 w-5 fill-current text-text" />
          ) : (
            <FileMusic className="h-5 w-5 text-text" />
          )}
        </span>
      </button>

      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-medium text-text" title={track.name}>
          {onOpen ? (
            <button
              type="button"
              disabled={!interactive}
              onClick={(event) => {
                event.stopPropagation()
                onOpen(track)
              }}
              className="max-w-full truncate text-left transition-colors hover:text-accent disabled:cursor-default disabled:hover:text-text"
            >
              {track.name}
            </button>
          ) : (
            track.name
          )}
        </p>
        <p className="truncate text-caption text-text-muted">
          {track.genre ?? 'Без жанра'} · {formatTrackDate(track.createdAt)}
        </p>
      </div>

      <Badge mono variant="neutral" className="max-sm:hidden shrink-0">
        {track.bpm === null ? 'BPM —' : `${track.bpm} BPM`}
      </Badge>

      {hasAudio ? (
        <span className="hidden w-12 shrink-0 text-right font-mono text-mono-badge text-text-muted sm:inline">
          {formatDuration(track.durationSec)}
        </span>
      ) : (
        <Badge variant="neutral" className="max-sm:hidden shrink-0">
          Файл проекта
        </Badge>
      )}

      <FavoriteButton
        isFavorite={track.isFavorite}
        trackName={track.name}
        disabled={!interactive}
        variant="plain"
        onToggle={() => onToggleFavorite?.(track)}
      />

      <div className="shrink-0">
        <DropdownMenu
          label={`Действия с треком «${track.name}»`}
          items={menuItems}
          placement="bottom"
          disabled={!interactive}
        />
      </div>
    </li>
  )
}
