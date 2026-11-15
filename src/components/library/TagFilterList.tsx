import { clsx } from 'clsx'
import { Tag } from '@/components/ui'
import type { TagStat } from '@/hooks/useLibraryFilters'

export interface TagFilterListProps {
  tags: TagStat[]
  activeTag: string | null
  onTagSelect: (tag: string | null) => void
  className?: string
}

export function TagFilterList({ tags, activeTag, onTagSelect, className }: TagFilterListProps) {
  if (tags.length === 0 && activeTag === null) {
    return <p className="text-caption text-text-muted">Тегов пока нет.</p>
  }

  return (
    <div
      role="group"
      aria-label="Фильтр по тегам"
      className={clsx('flex max-h-28 flex-wrap items-center gap-2 overflow-y-auto pr-1', className)}
    >
      <button
        type="button"
        aria-pressed={activeTag === null}
        onClick={() => onTagSelect(null)}
        className="inline-flex min-h-10 max-w-full items-center rounded-full transition-opacity hover:opacity-80"
      >
        <Tag active={activeTag === null}>Все теги</Tag>
      </button>

      {tags.map((tag) => {
        const active =
          activeTag !== null &&
          activeTag.toLocaleLowerCase('ru') === tag.name.toLocaleLowerCase('ru')
        return (
          <button
            key={tag.name}
            type="button"
            aria-pressed={active}
            onClick={() => onTagSelect(active ? null : tag.name)}
            className="inline-flex min-h-10 max-w-full items-center rounded-full transition-opacity hover:opacity-80"
          >
            <Tag active={active} className="gap-1.5">
              <span className="truncate">#{tag.name}</span>
              <span className="font-mono text-mono-badge opacity-70">{tag.count}</span>
            </Tag>
          </button>
        )
      })}
    </div>
  )
}
