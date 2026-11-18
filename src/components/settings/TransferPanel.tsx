import { Download, Upload } from 'lucide-react'
import { useRef } from 'react'
import { Button } from '@/components/ui'
import type { TransferProgress } from '@/types/models'
import { TransferStatus } from './TransferStatus'

export interface TransferPanelProps {
  exporting: boolean
  importing: boolean
  progress: TransferProgress | null
  errorMessage: string | null
  warningMessage: string | null
  onExport: () => void
  onSelectImportFile: (file: File) => void
}

export function TransferPanel({
  exporting,
  importing,
  progress,
  errorMessage,
  warningMessage,
  onExport,
  onSelectImportFile,
}: TransferPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const busy = exporting || importing

  return (
    <section
      aria-labelledby="settings-transfer-title"
      className="rounded-card border border-hairline bg-surface p-4"
    >
      <header>
        <h3 id="settings-transfer-title" className="text-h2 text-text">
          Перенос библиотеки
        </h3>
        <p className="mt-1 text-caption text-text-muted">
          ZIP-архив содержит метаданные, аудио, обложки и вложения. Его можно перенести на
          другое устройство.
        </p>
      </header>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-control border border-hairline bg-bg-subtle p-3">
          <h4 className="text-body font-medium text-text">Экспорт</h4>
          <p className="text-caption text-text-muted">
            Создаст архив всей библиотеки и скачает его.
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-auto self-start"
            leftIcon={<Download className="h-4 w-4" aria-hidden="true" />}
            loading={exporting}
            disabled={importing}
            onClick={onExport}
          >
            Экспортировать
          </Button>
          {exporting && progress && <TransferStatus progress={progress} />}
        </div>

        <div className="flex flex-col gap-2 rounded-control border border-hairline bg-bg-subtle p-3">
          <h4 className="text-body font-medium text-text">Импорт</h4>
          <p className="text-caption text-text-muted">
            Загрузите ZIP-архив, созданный BitVault.
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-auto self-start"
            leftIcon={<Upload className="h-4 w-4" aria-hidden="true" />}
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            Выбрать ZIP-архив
          </Button>
        </div>
      </div>

      {warningMessage && (
        <p
          role="status"
          className="mt-3 flex items-start gap-2 text-caption text-warning before:mt-1 before:h-1.5 before:w-1.5 before:shrink-0 before:rounded-full before:bg-warning before:content-['']"
        >
          {warningMessage}
        </p>
      )}

      {errorMessage && (
        <p
          role="alert"
          className="mt-3 rounded-control border border-danger/40 bg-danger/10 px-3 py-2 text-caption text-danger"
        >
          {errorMessage}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip,application/x-zip-compressed"
        className="hidden"
        aria-label="Выберите ZIP-архив библиотеки"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null
          event.target.value = ''
          if (file) onSelectImportFile(file)
        }}
      />
    </section>
  )
}
