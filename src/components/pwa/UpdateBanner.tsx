import { RefreshCw } from 'lucide-react'
import { Button, Led } from '@/components/ui'
import { usePwaUpdate } from '@/hooks/usePwaUpdate'
import type { UpdateStore } from '@/pwa/updateStore'

export interface UpdateBannerProps {
  /** Независимый стор для тестов; по умолчанию глобальный синглтон. */
  store?: UpdateStore
  /** Идёт загрузка, импорт или экспорт — обновляться сейчас нельзя. */
  blocked?: boolean
}

/**
 * Плашка о готовом обновлении PWA. Живёт в колонке контента между TopBar и
 * `<main>`, поэтому на узком экране текст переносится, а кнопки остаются
 * доступными в отдельной строке.
 */
export function UpdateBanner({ store, blocked = false }: UpdateBannerProps) {
  const { needRefresh, updating, applyUpdate, dismiss } = usePwaUpdate(store)

  if (!needRefresh) return null

  const description = blocked
    ? 'Дождитесь окончания загрузки или импорта — обновление перезагрузит страницу.'
    : 'Обновите страницу — библиотека и файлы останутся на месте.'

  return (
    <div className="flex shrink-0 flex-col gap-2 border-l-2 border-l-accent border-b border-b-divider bg-accent/10 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-4 sm:px-content">
      <div
        role="status"
        aria-live="polite"
        className="flex min-w-0 flex-1 items-start gap-3"
      >
        <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
        <div className="min-w-0 break-words">
          <p className="flex items-center gap-2 text-body font-medium text-text">
            <Led tone="accent" size="xs" />
            Доступна новая версия BitVault
          </p>
          <p className="text-caption text-text-muted">{description}</p>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:ml-auto">
        <Button
          type="button"
          variant="primary"
          size="sm"
          loading={updating}
          disabled={updating || blocked}
          onClick={() => {
            void applyUpdate()
          }}
        >
          Обновить
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={updating} onClick={dismiss}>
          Позже
        </Button>
      </div>
    </div>
  )
}
