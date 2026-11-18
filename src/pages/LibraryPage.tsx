import { clsx } from 'clsx'
import { AlertTriangle, Music, Plus, RotateCcw, Search } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button, EmptyState, Led, Spinner } from '@/components/ui'
import { TrackGrid } from '@/components/library/TrackGrid'
import { TrackList } from '@/components/library/TrackList'
import { formatTrackCount } from '@/components/library/format'
import type { TrackMenuAction } from '@/components/library/trackMenu'
import type { LibraryView, Track } from '@/types/models'

export interface LibraryPageProps {
  title: string
  tracks: Track[]
  view: LibraryView
  totalCount?: number
  selectedId?: string | null
  loading?: boolean
  errorMessage?: string | null
  onRetry?: () => void
  onPlay?: (track: Track) => void
  onOpen?: (track: Track) => void
  onToggleFavorite?: (track: Track) => void
  onMenuAction?: (track: Track, action: TrackMenuAction) => void
  onAddTrack?: () => void
  emptyTitle?: string
  emptyDescription?: string
  hasActiveFilters?: boolean
  onResetFilters?: () => void
  toolbar?: ReactNode
  className?: string
}

function LibrarySkeleton() {
  return (
    <div className="track-grid" aria-hidden="true">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className="flex h-full flex-col gap-3 rounded-card border border-hairline bg-surface p-2.5 shadow-soft"
        >
          <div className="aspect-square w-full animate-pulse rounded-control bg-surface-hover" />
          <div className="flex flex-col gap-2 px-0.5 pb-1">
            <div className="h-4 w-3/4 animate-pulse rounded-control bg-surface-hover" />
            <div className="h-3 w-1/2 animate-pulse rounded-control bg-surface-hover" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function LibraryPage({
  title,
  tracks,
  view,
  totalCount,
  selectedId = null,
  loading = false,
  errorMessage = null,
  onRetry,
  onPlay,
  onOpen,
  onToggleFavorite,
  onMenuAction,
  onAddTrack,
  emptyTitle,
  emptyDescription,
  hasActiveFilters = false,
  onResetFilters,
  toolbar,
  className,
}: LibraryPageProps) {
  const total = totalCount ?? tracks.length
  const blockingError = Boolean(errorMessage) && total === 0 && !loading
  const initialLoading = loading && total === 0

  return (
    <section
      aria-labelledby="library-title"
      aria-busy={loading || undefined}
      className={clsx('flex flex-col gap-5', className)}
    >
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-micro text-text-muted uppercase">
            <Led tone="accent" size="xs" />
            Коллекция
          </span>
          <span className="fl-inset inline-flex items-center rounded-chip border border-border px-2 py-1 font-mono text-mono-badge text-text-muted uppercase">
            {formatTrackCount(tracks.length)}
          </span>
        </div>

        <div className="flex flex-wrap items-baseline gap-3">
          <h1 id="library-title" className="text-display text-text">
            {title}
          </h1>
          {loading && total > 0 && (
            <span className="inline-flex items-center gap-1.5 text-caption text-text-muted">
              <Spinner size="sm" label="Обновление библиотеки" />
              Обновление…
            </span>
          )}
        </div>
      </header>

      {toolbar && total > 0 && !initialLoading && !blockingError && <div>{toolbar}</div>}

      {initialLoading ? (
        <div className="flex flex-col gap-3">
          <p role="status" className="sr-only">
            Загрузка библиотеки
          </p>
          <LibrarySkeleton />
        </div>
      ) : blockingError ? (
        <EmptyState
          icon={<AlertTriangle className="h-6 w-6" />}
          title="Не удалось загрузить библиотеку"
          description={errorMessage ?? undefined}
          action={
            onRetry ? (
              <Button
                onClick={onRetry}
                leftIcon={<RotateCcw className="h-4 w-4" aria-hidden="true" />}
              >
                Повторить
              </Button>
            ) : undefined
          }
        />
      ) : tracks.length === 0 ? (
        hasActiveFilters ? (
          <EmptyState
            icon={<Search className="h-6 w-6" />}
            title="Ничего не найдено"
            description="Измените запрос, тег или сбросьте фильтры."
            action={
              onResetFilters ? (
                <Button
                  variant="secondary"
                  onClick={onResetFilters}
                  leftIcon={<RotateCcw className="h-4 w-4" aria-hidden="true" />}
                >
                  Сбросить фильтры
                </Button>
              ) : undefined
            }
          />
        ) : (
          <EmptyState
            icon={<Music className="h-6 w-6" />}
            title={emptyTitle ?? 'Библиотека пока пуста'}
            description={
              emptyDescription ?? 'Добавьте первый бит — библиотека начнётся здесь.'
            }
            action={
              onAddTrack ? (
                <Button
                  onClick={onAddTrack}
                  leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
                >
                  Добавить биты
                </Button>
              ) : undefined
            }
          />
        )
      ) : view === 'grid' ? (
        <TrackGrid
          tracks={tracks}
          selectedId={selectedId}
          onPlay={onPlay}
          onOpen={onOpen}
          onToggleFavorite={onToggleFavorite}
          onMenuAction={onMenuAction}
        />
      ) : (
        <TrackList
          tracks={tracks}
          label={title}
          selectedId={selectedId}
          onPlay={onPlay}
          onOpen={onOpen}
          onToggleFavorite={onToggleFavorite}
          onMenuAction={onMenuAction}
        />
      )}
    </section>
  )
}
