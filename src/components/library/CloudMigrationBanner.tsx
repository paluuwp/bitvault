import { CloudUpload } from 'lucide-react'
import { Button } from '@/components/ui'
import type { CloudMigrationProgress } from '@/hooks/useCloudMigration'

export interface CloudMigrationBannerProps {
  count: number
  migrating: boolean
  progress: CloudMigrationProgress | null
  onMigrate: () => void
}

/**
 * Предлагает перенести локальные треки в библиотеку аккаунта.
 *
 * Автоматической загрузки нет: пользователь сам решает, когда отправлять
 * файлы на сервер.
 */
export function CloudMigrationBanner({
  count,
  migrating,
  progress,
  onMigrate,
}: CloudMigrationBannerProps) {
  if (count === 0 && !migrating) return null

  return (
    <section
      aria-label="Перенос в аккаунт"
      className="fl-panel animate-fade-up flex flex-wrap items-center justify-between gap-3 rounded-card px-4 py-3"
    >
      <div className="min-w-0">
        <p className="text-body text-text">
          {migrating
            ? 'Переносим треки в аккаунт…'
            : `${count} ${count === 1 ? 'бит хранится' : 'битов хранятся'} только на этом устройстве`}
        </p>
        <p className="text-caption text-text-muted" aria-live="polite">
          {migrating && progress
            ? `${progress.current} из ${progress.total} — ${progress.label}`
            : 'Перенесите их в аккаунт, чтобы открывать библиотеку на других устройствах.'}
        </p>
      </div>
      <Button
        variant="secondary"
        onClick={onMigrate}
        loading={migrating}
        disabled={migrating}
        leftIcon={<CloudUpload className="h-4 w-4" aria-hidden="true" />}
      >
        Перенести в аккаунт
      </Button>
    </section>
  )
}
