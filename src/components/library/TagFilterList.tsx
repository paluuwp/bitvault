import { clsx } from 'clsx'
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
      className={clsx(
        'fl-inset flex max-h-28 flex-wrap items-center gap-1.5 overflow-y-auto rounded-control border border-border px-1.5 py-1',
        className,
      )}
    >
      <button
        type="button"
        aria-pressed={activeTag === null}
        onClick={() => onTagSelect(null)}
        className="fl-key text-caption"
      >
        Все теги
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
            className="fl-key max-w-full text-caption"
          >
            <span className="min-w-0 truncate">#{tag.name}</span>
            <span className="font-mono text-mono-badge opacity-70">{tag.count}</span>
          </button>
        )
      })}
    </div>
  )
}
