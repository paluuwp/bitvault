import { clsx } from 'clsx'
import { Heart, Library, Settings, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button, IconButton, ProgressBar } from '@/components/ui'
import { formatBytes } from '@/lib/format'
import type { StorageInfo } from '@/types/models'
import type { AppSection } from './navigation'

export interface SidebarTag {
  name: string
  count: number
}

export interface SidebarProps {
  activeSection: AppSection
  onNavigate: (section: AppSection) => void
  onOpenSettings?: () => void
  onTagSelect?: (tag: string) => void
  onClose?: () => void
  tags?: SidebarTag[]
  libraryCount?: number
  favoritesCount?: number
  storageInfo?: StorageInfo | null
  storageLoading?: boolean
  className?: string
}

const navItems: { id: AppSection; label: string; icon: ReactNode }[] = [
  { id: 'library', label: 'Библиотека', icon: <Library className="h-5 w-5" aria-hidden="true" /> },
  { id: 'favorites', label: 'Избранное', icon: <Heart className="h-5 w-5" aria-hidden="true" /> },
]

export function Sidebar({
  activeSection,
  onNavigate,
  onOpenSettings,
  onTagSelect,
  onClose,
  tags = [],
  libraryCount = 0,
  favoritesCount = 0,
  storageInfo = null,
  storageLoading = false,
  className,
}: SidebarProps) {
  const usage = storageInfo?.usage ?? null
  const quota = storageInfo?.quota ?? null
  const storagePercent =
    usage !== null && quota !== null && quota > 0
      ? Math.min((usage / quota) * 100, 100)
      : null
  const storageWarning = storagePercent !== null && storagePercent > 80
  const storageSummary =
    usage !== null && quota !== null
      ? `${formatBytes(usage)} из ${formatBytes(quota)}`
      : storageLoading
        ? '…'
        : 'Нет данных'

  return (
    <div className={clsx('flex h-full min-h-0 flex-col bg-bg-subtle', className)}>
      <div className="flex h-topbar shrink-0 items-center justify-between gap-2 border-b border-border px-4">
        <div className="flex items-center gap-2">
          <span className="text-h2 font-semibold tracking-[0.16em] text-text">BITVAULT</span>
          <span aria-hidden="true" className="mt-1 h-1.5 w-1.5 rounded-full bg-accent" />
        </div>
        {onClose && (
          <IconButton label="Закрыть меню" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" aria-hidden="true" />
          </IconButton>
        )}
      </div>

      <nav aria-label="Основная навигация" className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-1">
          {navItems.map((item) => {
            const isActive = item.id === activeSection
            const count = item.id === 'library' ? libraryCount : favoritesCount
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={clsx(
                  'relative flex min-h-11 w-full items-center gap-3 rounded-control px-3 py-2.5 text-body transition-colors',
                  isActive
                    ? 'bg-surface text-text'
                    : 'text-text-muted hover:bg-surface-hover hover:text-text',
                )}
              >
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-accent"
                  />
                )}
                {item.icon}
                <span className="truncate">{item.label}</span>
                <span className="ml-auto shrink-0 font-mono text-mono-badge text-text-muted">
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        <div className="mt-6">
          <h2 className="px-3 pb-2 text-caption tracking-[0.08em] text-text-muted uppercase">
            Теги
          </h2>
          {tags.length === 0 ? (
            <p className="px-3 text-caption text-text-muted">
              Теги появятся после добавления битов.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {tags.map((tag) => (
                <li key={tag.name}>
                  <button
                    type="button"
                    onClick={() => onTagSelect?.(tag.name)}
                    className="group flex min-h-10 w-full items-center justify-between gap-2 rounded-control px-3 py-1.5 text-body text-text-muted transition-colors hover:bg-surface hover:text-text"
                  >
                    <span className="truncate">#{tag.name}</span>
                    <span className="shrink-0 font-mono text-mono-badge text-text-muted">
                      {tag.count}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </nav>

      <div className="shrink-0 space-y-3 border-t border-border p-4">
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={onOpenSettings}
            title={
              storagePercent !== null
                ? `Занято ${Math.round(storagePercent)}% — открыть настройки`
                : 'Открыть настройки хранилища'
            }
            className="flex min-h-10 w-full items-center justify-between gap-2 rounded-control py-1 text-left"
          >
            <span className="text-caption text-text-muted">Хранилище</span>
            <span
              className={clsx(
                'truncate font-mono text-mono-badge',
                storageWarning ? 'text-warning' : 'text-text-muted',
              )}
            >
              {storageSummary}
            </span>
          </button>
          <ProgressBar
            value={storagePercent ?? 0}
            label="Использование локального хранилища"
          />
          <p className={clsx('text-caption', storageWarning ? 'text-warning' : 'text-text-muted')}>
            {storageWarning
              ? 'Заполнено больше 80% — освободите место или экспортируйте библиотеку.'
              : 'Данные хранятся в браузере'}
          </p>
        </div>
        <Button
          variant="ghost"
          fullWidth
          aria-label="Настройки"
          leftIcon={<Settings className="h-4 w-4" aria-hidden="true" />}
          onClick={onOpenSettings}
        >
          Настройки
        </Button>
      </div>
    </div>
  )
}
