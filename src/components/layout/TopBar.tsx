import {
  ArrowDownNarrowWide,
  ArrowUpNarrowWide,
  LayoutGrid,
  List,
  Menu,
  Plus,
  Search,
} from 'lucide-react'
import {
  Button,
  IconButton,
  Input,
  SegmentedControl,
  Select,
  ToolbarGroup,
} from '@/components/ui'
import type { SegmentedControlOption } from '@/components/ui'
import type { LibraryView, SortDirection, SortField } from '@/types/models'

const viewOptions: readonly SegmentedControlOption<LibraryView>[] = [
  {
    value: 'grid',
    label: 'Сетка',
    ariaLabel: 'Сетка',
    icon: <LayoutGrid className="h-4 w-4" aria-hidden="true" />,
  },
  {
    value: 'list',
    label: 'Список',
    ariaLabel: 'Список',
    icon: <List className="h-4 w-4" aria-hidden="true" />,
  },
]

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
    <header className="shrink-0 px-2 pt-2">
      <div className="fl-toolbar flex-wrap gap-2 px-3 py-2 md:min-h-topbar md:flex-nowrap md:gap-0 md:px-4 md:py-0 lg:px-content">
        <IconButton
          label="Открыть меню"
          variant="key"
          onClick={onOpenSidebar}
          className="order-1 md:order-first lg:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </IconButton>

        {/* На узком экране поиск занимает отдельную строку; на md+ растягивается слева. */}
        <ToolbarGroup
          label="Поиск"
          divider={false}
          className="order-4 basis-full md:order-none md:basis-auto md:grow"
        >
          <Input
            type="search"
            aria-label="Поиск по библиотеке"
            placeholder="Поиск по названию, жанру, тегу…"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            leadingIcon={<Search aria-hidden="true" />}
            className="h-11 rounded-full text-body md:h-8 md:text-caption"
            containerClassName="min-w-0 w-full md:max-w-[420px] [&_input]:rounded-full [&_input]:border-control-border [&_input]:bg-bg-subtle/45 [&_input]:shadow-sunken [&_input]:backdrop-blur-sm [&_input:hover:not(:focus)]:border-control-border-hover"
          />
        </ToolbarGroup>

        {/* Оба контрола сортировки рассчитаны на lg — ниже группа пустая. */}
        <ToolbarGroup label="Сортировка" className="max-lg:hidden" divider={false}>
          <Select
            aria-label="Сортировка"
            value={sort}
            onChange={(event) => onSortChange(event.target.value as SortField)}
            containerClassName="hidden shrink-0 lg:block [&_select]:h-8 [&_select]:w-auto [&_select]:rounded-full [&_select]:bg-bg-subtle/40 [&_select]:pl-3 [&_select]:text-caption"
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
            variant="key"
            onClick={onToggleSortDirection}
            className="rounded-full max-lg:hidden"
          >
            {sortDirection === 'asc' ? (
              <ArrowUpNarrowWide className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ArrowDownNarrowWide className="h-4 w-4" aria-hidden="true" />
            )}
          </IconButton>
        </ToolbarGroup>

        <ToolbarGroup label="Вид" className="order-2 md:order-none" divider={false}>
          <SegmentedControl
            label="Вид отображения"
            value={view}
            options={viewOptions}
            onChange={onViewChange}
          />
        </ToolbarGroup>

        <ToolbarGroup
          label="Действия"
          className="order-3 ml-auto md:order-none md:ml-0"
          divider={false}
        >
          <Button
            variant="primary"
            size="toolbar"
            onClick={onAddTrack}
            aria-label="Добавить биты"
            className="rounded-full shadow-[0_8px_20px_-8px_rgb(247_147_30/0.7)] max-md:h-11 max-md:min-w-11 max-md:px-0"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span className="hidden md:inline">Добавить биты</span>
          </Button>
        </ToolbarGroup>
      </div>
    </header>
  )
}
