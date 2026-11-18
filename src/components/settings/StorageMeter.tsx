import { HardDrive, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Button, ProgressBar, Spinner } from '@/components/ui'
import { formatBytes } from '@/lib/format'
import type { StorageInfo } from '@/types/models'

export interface StorageMeterProps {
  info: StorageInfo | null
  loading: boolean
  onRequestPersistence: () => Promise<boolean>
}

export function StorageMeter({ info, loading, onRequestPersistence }: StorageMeterProps) {
  const [persistencePending, setPersistencePending] = useState(false)
  const [persistenceMessage, setPersistenceMessage] = useState<string | null>(null)

  const usage = info?.usage ?? null
  const quota = info?.quota ?? null
  const hasNumbers = usage !== null && quota !== null && quota > 0
  const percent =
    usage !== null && quota !== null && quota > 0
      ? Math.min((usage / quota) * 100, 100)
      : 0
  const highUsage = hasNumbers && percent > 80

  const handlePersistence = async () => {
    if (persistencePending) return
    setPersistencePending(true)
    setPersistenceMessage(null)
    try {
      const granted = await onRequestPersistence()
      setPersistenceMessage(
        granted
          ? 'Постоянное хранение включено.'
          : 'Браузер не предоставил постоянное хранение.',
      )
    } finally {
      setPersistencePending(false)
    }
  }

  return (
    <section
      aria-labelledby="settings-storage-title"
      className="rounded-card border border-hairline bg-surface p-4"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3
            id="settings-storage-title"
            className="flex items-center gap-2 text-h2 text-text"
          >
            <HardDrive className="h-4 w-4 text-text-muted" aria-hidden="true" />
            Хранилище
          </h3>
          <p className="mt-1 text-caption text-text-muted">
            Библиотека хранится в браузере на этом устройстве.
          </p>
        </div>
        {loading && <Spinner size="sm" label="Обновление данных о хранилище" />}
      </header>

      {info === null ? (
        <p className="mt-3 text-caption text-text-muted">Получаем данные о хранилище…</p>
      ) : !info.supported ? (
        <p className="mt-3 text-caption text-text-muted">
          Браузер не сообщает данные о локальном хранилище.
        </p>
      ) : hasNumbers ? (
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-body tabular-nums text-text">
              {formatBytes(usage)} из {formatBytes(quota)}
            </span>
            <span
              className={
                highUsage
                  ? 'text-caption tabular-nums text-warning'
                  : 'text-caption tabular-nums text-text-muted'
              }
            >
              {Math.round(percent)}%
            </span>
          </div>
          <ProgressBar
            value={percent}
            label="Использование локального хранилища"
            size="sm"
          />
          {highUsage && (
            <p role="status" className="text-caption text-warning">
              Занято больше 80% — освободите место или сначала экспортируйте библиотеку.
            </p>
          )}
        </div>
      ) : (
        <p className="mt-3 text-caption text-text-muted">
          Браузер не сообщает точный размер библиотеки.
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2 border-t border-hairline pt-3">
        <p className="flex items-start gap-2 rounded-control border border-hairline bg-bg-subtle p-3 text-caption text-text-muted">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {info?.persisted
            ? 'Постоянное хранение включено — браузер не удалит данные автоматически.'
            : 'Браузер может удалить данные при нехватке места. Экспорт сохранит копию.'}
        </p>

        {info?.supported && !info.persisted && (
          <div>
            <Button
              variant="secondary"
              size="sm"
              loading={persistencePending}
              onClick={() => void handlePersistence()}
            >
              Разрешить постоянное хранение
            </Button>
          </div>
        )}

        {persistenceMessage && (
          <p role="status" className="text-caption text-text-muted">
            {persistenceMessage}
          </p>
        )}
      </div>
    </section>
  )
}
