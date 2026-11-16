import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { UpdateBanner } from '@/components/pwa/UpdateBanner'
import type { LibraryView, SortDirection, SortField, StorageInfo } from '@/types/models'
import type { AppSection } from './navigation'
import { PlayerBar } from './PlayerBar'
import { Sidebar } from './Sidebar'
import type { SidebarAccount, SidebarTag } from './Sidebar'
import { TopBar } from './TopBar'

export interface AppShellProps {
  children: ReactNode
  activeSection: AppSection
  onNavigate: (section: AppSection) => void
  onOpenSettings?: () => void
  onTagSelect?: (tag: string) => void
  tags?: SidebarTag[]
  libraryCount?: number
  favoritesCount?: number
  storageInfo?: StorageInfo | null
  storageLoading?: boolean
  /** Сведения об аккаунте для блока в сайдбаре. */
  account?: SidebarAccount
  onOpenAccount?: () => void
  query: string
  onQueryChange: (value: string) => void
  sort: SortField
  sortDirection: SortDirection
  onSortChange: (value: SortField) => void
  onToggleSortDirection: () => void
  view: LibraryView
  onViewChange: (value: LibraryView) => void
  onAddTrack: () => void
  /** Идёт загрузка/импорт/экспорт — перезагрузка для обновления PWA запрещена. */
  updatesBlocked?: boolean
}

export function AppShell({
  children,
  activeSection,
  onNavigate,
  onOpenSettings,
  onTagSelect,
  tags,
  libraryCount,
  favoritesCount,
  storageInfo,
  storageLoading,
  account,
  onOpenAccount,
  query,
  onQueryChange,
  sort,
  sortDirection,
  onSortChange,
  onToggleSortDirection,
  view,
  onViewChange,
  onAddTrack,
  updatesBlocked = false,
}: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!sidebarOpen) return

    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    panelRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSidebarOpen(false)
        return
      }
      if (event.key !== 'Tab') return

      // Панель объявлена модальным диалогом — держим фокус внутри неё.
      const panel = panelRef.current
      if (!panel) return
      // Панель скрыта на широком экране: не перехватываем Tab у обычной страницы.
      if (panel.getClientRects().length === 0) return

      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      )
      if (focusable.length === 0) {
        event.preventDefault()
        panel.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (!(active instanceof Node) || !panel.contains(active) || active === panel) {
        event.preventDefault()
        // С контейнера Shift+Tab тоже уходит назад — отправляем к последнему элементу.
        const target = event.shiftKey ? last : first
        target?.focus()
        return
      }
      if (event.shiftKey && active === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)

    // На широком экране панель становится невидимой — закрываем её, чтобы не
    // держать фокус в скрытом поддереве.
    const wideQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(min-width: 1024px)')
        : null
    const handleWideChange = (event: MediaQueryListEvent) => {
      if (event.matches) setSidebarOpen(false)
    }
    wideQuery?.addEventListener('change', handleWideChange)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      wideQuery?.removeEventListener('change', handleWideChange)
      document.body.style.overflow = previousOverflow
      previouslyFocusedRef.current?.focus()
    }
  }, [sidebarOpen])

  const closeSidebar = () => setSidebarOpen(false)

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg text-text">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[70] focus:rounded-control focus:bg-accent focus:px-4 focus:py-2 focus:text-body focus:font-medium focus:text-accent-ink"
      >
        Перейти к содержимому
      </a>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-sidebar shrink-0 border-r border-border lg:block">
          <Sidebar
            activeSection={activeSection}
            onNavigate={onNavigate}
            onOpenSettings={onOpenSettings}
            onTagSelect={onTagSelect}
            tags={tags}
            libraryCount={libraryCount}
            favoritesCount={favoritesCount}
            storageInfo={storageInfo}
            storageLoading={storageLoading}
            account={account}
            onOpenAccount={onOpenAccount}
          />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            query={query}
            onQueryChange={onQueryChange}
            sort={sort}
            sortDirection={sortDirection}
            onSortChange={onSortChange}
            onToggleSortDirection={onToggleSortDirection}
            view={view}
            onViewChange={onViewChange}
            onAddTrack={onAddTrack}
            onOpenSidebar={() => setSidebarOpen(true)}
          />
          <UpdateBanner blocked={updatesBlocked} />
          <main
            id="main-content"
            tabIndex={-1}
            className="min-h-0 flex-1 overflow-y-auto px-content py-4"
          >
            {children}
          </main>
        </div>
      </div>

      <PlayerBar />

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            aria-hidden="true"
            onClick={closeSidebar}
            className="absolute inset-0 bg-black/70"
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Боковое меню"
            tabIndex={-1}
            className="absolute inset-y-0 left-0 flex w-[min(88vw,320px)] flex-col border-r border-control-border bg-bg-subtle outline-none"
          >
            <Sidebar
              activeSection={activeSection}
              onNavigate={(section) => {
                onNavigate(section)
                closeSidebar()
              }}
              onOpenSettings={() => {
                onOpenSettings?.()
                closeSidebar()
              }}
              onTagSelect={(tag) => {
                onTagSelect?.(tag)
                closeSidebar()
              }}
              tags={tags}
              libraryCount={libraryCount}
              favoritesCount={favoritesCount}
              storageInfo={storageInfo}
              storageLoading={storageLoading}
              account={account}
              onOpenAccount={
                onOpenAccount
                  ? () => {
                      onOpenAccount()
                      closeSidebar()
                    }
                  : undefined
              }
              onClose={closeSidebar}
            />
          </div>
        </div>
      )}
    </div>
  )
}
