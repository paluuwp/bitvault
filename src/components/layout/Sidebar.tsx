import { clsx } from 'clsx'
import { Heart, Library, LogIn, Settings, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button, IconButton, Led } from '@/components/ui'
import type { AppSection } from './navigation'

export interface SidebarTag {
  name: string
  count: number
}

/** Краткие сведения об аккаунте для блока в нижней части сайдбара. */
export interface SidebarAccount {
  status: 'anonymous' | 'authenticated'
  /** Имя пользователя, а при его отсутствии — e-mail. */
  label: string
  email?: string | null
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
  /** Блок аккаунта над «Настройками»; без него блок не рендерится. */
  account?: SidebarAccount
  onOpenAccount?: () => void
  className?: string
}

const navItems: { id: AppSection; label: string; icon: ReactNode }[] = [
  { id: 'library', label: 'Библиотека', icon: <Library className="h-5 w-5" aria-hidden="true" /> },
  { id: 'favorites', label: 'Избранное', icon: <Heart className="h-5 w-5" aria-hidden="true" /> },
]

/** Инициалы для локального аватара в блоке аккаунта. */
function accountInitials(label: string): string {
  const trimmed = label.trim()
  if (!trimmed) return '?'

  const words = trimmed.split(/\s+/).filter((word) => word.length > 0)
  if (words.length >= 2) {
    const first = Array.from(words[0])[0] ?? ''
    const second = Array.from(words[1])[0] ?? ''
    return `${first}${second}`.toUpperCase()
  }

  const first = Array.from(trimmed)[0]
  return first ? first.toUpperCase() : '?'
}

export function Sidebar({
  activeSection,
  onNavigate,
  onOpenSettings,
  onTagSelect,
  onClose,
  tags = [],
  libraryCount = 0,
  favoritesCount = 0,
  account,
  onOpenAccount,
  className,
}: SidebarProps) {
  return (
    <div
      className={clsx(
        'flex h-full min-h-0 flex-col bg-gradient-to-b from-surface-chrome/40 via-bg-subtle/45 to-bg/60 backdrop-blur-2xl',
        className,
      )}
    >
      <div className="flex h-topbar shrink-0 items-center justify-between gap-2 border-b border-divider px-4">
        <div className="flex items-center gap-2">
          <span className="font-mono text-h2 font-semibold tracking-[0.16em] uppercase text-text">
            BITVAULT
          </span>
          <Led tone="accent" />
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
                    ? 'bg-gradient-to-r from-surface-raised to-surface-raised/55 text-text shadow-bevel'
                    : 'text-text-muted hover:bg-surface-hover hover:text-text',
                )}
              >
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute top-2 bottom-2 left-0 w-0.5 rounded-r-chip bg-accent shadow-[0_0_10px_rgb(247_147_30/0.55)]"
                  />
                )}
                {item.icon}
                <span className="truncate">{item.label}</span>
                <span className="ml-auto shrink-0 rounded-chip bg-bg-subtle px-1.5 py-0.5 font-mono text-micro text-text-muted">
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        <div className="mt-6">
          <div className="fl-groove mx-3 mb-2" aria-hidden="true" />
          <h2 className="px-3 pb-2 text-micro text-text-muted uppercase">Теги</h2>
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

      <div className="shrink-0 space-y-2 border-t border-divider p-3">
        {account && onOpenAccount ? (
          account.status === 'authenticated' ? (
            <button
              type="button"
              onClick={onOpenAccount}
              className="flex min-h-11 w-full items-center gap-2 rounded-control border border-border bg-gradient-to-b from-surface-raised to-surface-raised/60 px-2.5 py-1.5 text-left transition-colors hover:bg-surface-hover"
            >
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-caption font-medium text-text-muted"
              >
                {accountInitials(account.label)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span aria-hidden="true" className="fl-led shrink-0 text-accent" />
                  <span className="min-w-0 truncate text-body text-text">{account.label}</span>
                </span>
                {account.email && account.email !== account.label ? (
                  <span className="block truncate text-caption text-text-muted">
                    {account.email}
                  </span>
                ) : null}
              </span>
            </button>
          ) : (
            <Button
              variant="secondary"
              fullWidth
              leftIcon={<LogIn className="h-4 w-4" aria-hidden="true" />}
              onClick={onOpenAccount}
            >
              Войти
            </Button>
          )
        ) : null}
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
