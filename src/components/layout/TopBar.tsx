import { ArrowDownNarrowWide, ArrowUpNarrowWide, LayoutGrid, List, Menu, Plus, Search } from 'lucide-react'
import { Button, IconButton, Input, Select } from '@/components/ui'
import type { LibraryView, SortDirection, SortField } from '@/types/models'

export interface TopBarProps {
  query: string
  onQueryChange: (value: string) => void
  sort: SortField
  sortDirection: SortDirection
  onSortChange: (value: SortField) => void
  onToggleSortDirection: () => void
  view: LibraryView
  onViewChange: (value: LibraryView) => void
  onAddTrack: () => void
  onOpenSidebar: () => void
}

export function TopBar({
  query,
  onQueryChange,
  sort,
  sortDirection,
  onSortChange,
  onToggleSortDirection,
  view,
  onViewChange,
  onAddTrack,
  onOpenSidebar,
}: TopBarProps) {
  return (
    <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-surface-raised px-3 py-2 shadow-bevel sm:px-4 md:h-topbar md:flex-nowrap md:gap-3 md:py-0 lg:px-content">
      <div className="flex w-full min-w-0 items-center gap-2 md:w-auto md:flex-1 md:max-w-[420px]">
        <IconButton
          label="Открыть меню"
          variant="ghost"
          onClick={onOpenSidebar}
          className="lg:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </IconButton>

        <div className="min-w-0 flex-1">
          <Input
            type="search"
            aria-label="Поиск по библиотеке"
            placeholder="Поиск по названию, жанру, тегу…"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            leadingIcon={<Search aria-hidden="true" />}
            containerClassName="[&_input]:border-control-border [&_input]:shadow-sunken [&_input:hover:not(:focus)]:border-control-border-hover"
          />
        </div>
      </div>

      <div className="flex w-full min-w-0 items-center gap-2 md:ml-auto md:w-auto md:shrink-0">
        <div aria-hidden="true" className="hidden shrink-0 items-center gap-1 md:flex">
          <span className="fl-led text-led-green" />
          <span className="fl-led text-led-amber" />
          <span className="fl-led text-led-red" />
        </div>

        <Select
          aria-label="Сортировка"
          value={sort}
          onChange={(event) => onSortChange(event.target.value as SortField)}
          containerClassName="hidden shrink-0 lg:block [&_select]:w-auto"
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
          className="max-lg:hidden"
        >
          {sortDirection === 'asc' ? (
            <ArrowUpNarrowWide className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ArrowDownNarrowWide className="h-4 w-4" aria-hidden="true" />
          )}
        </IconButton>

        <div
          role="group"
          aria-label="Вид отображения"
          className="flex shrink-0 items-center gap-0.5 rounded-control border border-control-border bg-bg-subtle p-0.5 [&_button[aria-pressed=true]]:bg-surface-raised [&_button[aria-pressed=true]]:text-accent"
        >
          <IconButton
            label="Сетка"
            active={view === 'grid'}
            aria-pressed={view === 'grid'}
            onClick={() => onViewChange('grid')}
          >
            <LayoutGrid className="h-5 w-5" aria-hidden="true" />
          </IconButton>
          <IconButton
            label="Список"
            active={view === 'list'}
            aria-pressed={view === 'list'}
            onClick={() => onViewChange('list')}
          >
            <List className="h-5 w-5" aria-hidden="true" />
          </IconButton>
        </div>

        <Button
          variant="primary"
          onClick={onAddTrack}
          aria-label="Добавить биты"
          className="ml-auto shrink-0 md:ml-0"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span className="hidden md:inline">Добавить биты</span>
        </Button>
      </div>
    </header>
  )
}
