import { clsx } from 'clsx'
import { ArrowDownNarrowWide, ArrowUpNarrowWide, Heart, RotateCcw } from 'lucide-react'
import { Button, IconButton, Select } from '@/components/ui'
import type { TagStat } from '@/hooks/useLibraryFilters'
import type { SortDirection, SortField } from '@/types/models'
import { formatTrackCount } from './format'
import { TagFilterList } from './TagFilterList'

export interface LibraryToolbarProps {
  onlyFavorites: boolean
  onToggleOnlyFavorites: () => void
  showFavoritesFilter?: boolean
  tags: TagStat[]
  activeTag: string | null
  onTagSelect: (tag: string | null) => void
  hasActiveFilters: boolean
  onResetFilters: () => void
  resultCount: number
  totalCount: number
  sort: SortField
  sortDirection: SortDirection
  onSortChange: (value: SortField) => void
  onToggleSortDirection: () => void
}

export function LibraryToolbar({
  onlyFavorites,
  onToggleOnlyFavorites,
  showFavoritesFilter = true,
  tags,
  activeTag,
  onTagSelect,
  hasActiveFilters,
  onResetFilters,
  resultCount,
  totalCount,
  sort,
  sortDirection,
  onSortChange,
  onToggleSortDirection,
}: LibraryToolbarProps) {
  const countLabel = hasActiveFilters
    ? `${resultCount} из ${formatTrackCount(totalCount)}`
    : formatTrackCount(resultCount)

  return (
    <div className="fl-panel flex flex-col gap-3 rounded-card px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        {showFavoritesFilter && (
          <Button
            variant={onlyFavorites ? 'primary' : 'secondary'}
            size="sm"
            aria-pressed={onlyFavorites}
            leftIcon={
              <span className="inline-flex items-center gap-1.5">
                <Heart
                  className={onlyFavorites ? 'h-4 w-4 fill-current' : 'h-4 w-4'}
                  aria-hidden="true"
                />
                <span
                  aria-hidden="true"
                  className={clsx(
                    'fl-led',
                    onlyFavorites ? 'text-favorite' : 'text-text-subtle',
                  )}
                />
              </span>
            }
            onClick={onToggleOnlyFavorites}
          >
            Только избранное
          </Button>
        )}

        <span className="text-caption text-text-muted" aria-live="polite">
          {countLabel}
        </span>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            leftIcon={<RotateCcw className="h-4 w-4" aria-hidden="true" />}
            onClick={onResetFilters}
          >
            Сбросить фильтры
          </Button>
        )}
      </div>

      {/* На узких экранах сортировка живёт здесь: в TopBar её не видно. */}
      <div className="flex items-center gap-2 lg:hidden">
        <Select
          aria-label="Сортировка"
          value={sort}
          onChange={(event) => onSortChange(event.target.value as SortField)}
          containerClassName="min-w-0 flex-1 [&_select]:w-full"
        >
          <option value="createdAt">Сначала новые</option>
          <option value="name">По названию</option>
          <option value="bpm">По BPM</option>
          <option value="lastPlayedAt">Недавно прослушанные</option>
        </Select>
        <IconButton
          label={
            sortDirection === 'asc'
              ? 'Направление: по возрастанию'
              : 'Направление: по убыванию'
          }
          tooltip={
            sortDirection === 'asc'
              ? 'По возрастанию — нажмите, чтобы изменить'
              : 'По убыванию — нажмите, чтобы изменить'
          }
          variant="secondary"
          onClick={onToggleSortDirection}
        >
          {sortDirection === 'asc' ? (
            <ArrowUpNarrowWide className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ArrowDownNarrowWide className="h-4 w-4" aria-hidden="true" />
          )}
        </IconButton>
      </div>

      <TagFilterList tags={tags} activeTag={activeTag} onTagSelect={onTagSelect} />
    </div>
  )
}
