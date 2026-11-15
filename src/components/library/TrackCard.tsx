import { clsx } from 'clsx'
import { FileMusic, Play } from 'lucide-react'
import { useId } from 'react'
import type { MouseEvent } from 'react'
import { useBlobUrl } from '@/hooks/useBlobUrl'
import { Badge, DropdownMenu, Spinner, Tag } from '@/components/ui'
import type { Track } from '@/types/models'
import { FavoriteButton } from './FavoriteButton'
import {
  formatDuration,
  formatTrackDate,
  getCoverGradient,
  getCoverLetter,
} from './format'
import { buildTrackMenuItems } from './trackMenu'
import type { TrackMenuAction } from './trackMenu'

export interface TrackCardProps {
  track: Track
  selected?: boolean
  disabled?: boolean
  loading?: boolean
  onPlay?: (track: Track) => void
  onOpen?: (track: Track) => void
  onToggleFavorite?: (track: Track) => void
  onMenuAction?: (track: Track, action: TrackMenuAction) => void
  className?: string
}

export function TrackCard({
  track,
  selected = false,
  disabled = false,
  loading = false,
  onPlay,
  onOpen,
  onToggleFavorite,
  onMenuAction,
  className,
}: TrackCardProps) {
  const titleId = useId()
  const interactive = !disabled && !loading
  const hasAudio = track.audioFileId !== null
  const menuItems = buildTrackMenuItems(track, onMenuAction)
  const visibleTags = track.tags.slice(0, 3)
  const extraTagCount = track.tags.length - visibleTags.length
  const cover = useBlobUrl(track.coverFileId)

  const handleCardClick = (event: MouseEvent<HTMLElement>) => {
    if (!interactive || !onOpen) return
    const target = event.target
    if (target instanceof Element && target.closest('button, a, input, textarea, select, [role="menu"]')) {
      return
    }
    onOpen(track)
  }

  const handlePrimaryAction = () => {
    if (hasAudio) {
      onPlay?.(track)
    } else {
      onOpen?.(track)
    }
  }

  return (
    <article
      aria-labelledby={titleId}
      aria-busy={loading || undefined}
      onClick={handleCardClick}
      className={clsx(
        'group relative flex h-full flex-col gap-3 rounded-card border bg-surface p-2.5 transition-[transform,border-color] duration-200 hover:z-10 focus-within:z-10',
        selected ? 'border-accent focus-within:border-accent' : 'border-border',
        interactive && !selected && 'hover:-translate-y-0.5 hover:border-border-strong focus-within:border-border-strong',
        disabled && 'opacity-60',
        onOpen && 'cursor-pointer',
        className,
      )}
    >
      <div className="relative">
        <div className="relative aspect-square w-full overflow-hidden rounded-control">
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{ backgroundImage: getCoverGradient(track.color) }}
          />
          <span
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center text-4xl font-semibold text-accent-ink/70 select-none"
          >
            {getCoverLetter(track.name)}
          </span>

          {cover.url && (
            <img
              src={cover.url}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}

          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <button
              type="button"
              disabled={!interactive}
              onClick={handlePrimaryAction}
              aria-label={
                hasAudio ? `Воспроизвести «${track.name}»` : `Открыть «${track.name}»`
              }
              className={clsx(
                'track-card-play pointer-events-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-ink transition-opacity duration-150 disabled:opacity-40 motion-reduce:transition-none',
                loading
                  ? 'opacity-100'
                  : 'md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100',
              )}
            >
              {loading ? (
                <Spinner size="md" label="Загрузка трека" />
              ) : hasAudio ? (
                <Play className="h-5 w-5 fill-current" aria-hidden="true" />
              ) : (
                <FileMusic className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
          </div>

          <Badge mono variant="overlay" className="absolute top-2 left-2 z-10">
            {track.bpm === null ? 'BPM —' : `${track.bpm} BPM`}
          </Badge>

          <FavoriteButton
            isFavorite={track.isFavorite}
            trackName={track.name}
            disabled={!interactive}
            variant="overlay"
            onToggle={() => onToggleFavorite?.(track)}
            className="absolute top-2 right-2 z-10"
          />

          {hasAudio ? (
            <Badge mono variant="overlay" className="absolute bottom-2 left-2 z-10">
              {formatDuration(track.durationSec)}
            </Badge>
          ) : (
            <Badge variant="overlay" className="absolute bottom-2 left-2 z-10">
              Файл проекта
            </Badge>
          )}
        </div>

        <div className="absolute right-2 bottom-2 z-10">
          <DropdownMenu
            label={`Действия с треком «${track.name}»`}
            items={menuItems}
            placement="top"
            disabled={!interactive}
            triggerClassName="bg-bg/60 text-text backdrop-blur-sm hover:bg-bg/80"
          />
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-2 px-0.5 pb-1">
        <h3
          id={titleId}
          title={track.name}
          className="line-clamp-2 text-body font-medium text-text"
        >
          {onOpen ? (
            <button
              type="button"
              disabled={!interactive}
              onClick={(event) => {
                event.stopPropagation()
                onOpen(track)
              }}
              className="text-left transition-colors hover:text-accent disabled:cursor-default disabled:hover:text-text"
            >
              {track.name}
            </button>
          ) : (
            track.name
          )}
        </h3>
        <p className="truncate text-caption text-text-muted">
          {track.genre ?? 'Без жанра'} · {formatTrackDate(track.createdAt)}
        </p>
        {visibleTags.length > 0 && (
          <ul aria-label="Теги" className="flex flex-wrap items-center gap-1.5">
            {visibleTags.map((tag) => (
              <li key={tag} className="min-w-0 max-w-full">
                <Tag>#{tag}</Tag>
              </li>
            ))}
            {extraTagCount > 0 && (
              <li className="text-caption text-text-muted">+{extraTagCount}</li>
            )}
          </ul>
        )}
      </div>
    </article>
  )
}
