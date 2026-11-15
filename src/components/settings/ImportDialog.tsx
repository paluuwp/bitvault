import { clsx } from 'clsx'
import { useEffect, useState } from 'react'
import { Button, Input, Modal } from '@/components/ui'
import type { ImportMode } from '@/hooks/useLibraryTransfer'
import type { ImportResult, TransferProgress } from '@/types/models'
import { TransferStatus } from './TransferStatus'

export interface ImportDialogProps {
  open: boolean
  file: File | null
  busy: boolean
  /** Идёт загрузка файлов: импорт заблокирован, чтобы не смешивать записи в хранилище. */
  uploading?: boolean
  exporting: boolean
  progress: TransferProgress | null
  errorMessage: string | null
  onClose: () => void
  onImport: (mode: ImportMode) => Promise<ImportResult | null>
  onExportFirst: () => void
}

function ImportReport({ result }: { result: ImportResult }) {
  const hasWarnings = result.warnings.length > 0
  const hasErrors = result.errors.length > 0

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-control border border-border bg-bg-subtle p-3">
          <dt className="text-caption text-text-muted">Импортировано</dt>
          <dd className="mt-0.5 font-mono text-h1 text-text">{result.tracksImported}</dd>
        </div>
        <div className="rounded-control border border-border bg-bg-subtle p-3">
          <dt className="text-caption text-text-muted">Пропущено</dt>
          <dd className="mt-0.5 font-mono text-h1 text-text">{result.tracksSkipped}</dd>
        </div>
        <div className="rounded-control border border-border bg-bg-subtle p-3">
          <dt className="text-caption text-text-muted">Файлов</dt>
          <dd className="mt-0.5 font-mono text-h1 text-text">{result.filesImported}</dd>
        </div>
      </dl>

      {hasWarnings && (
        <section role="status">
          <h3 className="text-body font-medium text-text">Предупреждения</h3>
          <ul className="mt-1 list-inside list-disc space-y-1 text-caption text-text-muted">
            {result.warnings.map((warning, index) => (
              <li key={`${index}-${warning}`}>{warning}</li>
            ))}
          </ul>
        </section>
      )}

      {hasErrors && (
        <section role="alert">
          <h3 className="text-body font-medium text-danger">Ошибки</h3>
          <ul className="mt-1 list-inside list-disc space-y-1 text-caption text-danger">
            {result.errors.map((issue, index) => (
              <li key={`${index}-${issue.item}-${issue.code}`}>
                {issue.item}: {issue.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!hasWarnings && !hasErrors && (
        <p className="text-caption text-text-muted">Импорт прошёл без замечаний.</p>
      )}
    </div>
  )
}

export function ImportDialog({
  open,
  file,
  busy,
  uploading = false,
  exporting,
  progress,
  errorMessage,
  onClose,
  onImport,
  onExportFirst,
}: ImportDialogProps) {
  const [mode, setMode] = useState<ImportMode>('merge')
  const [confirmText, setConfirmText] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)

  useEffect(() => {
    if (!open) return
    setMode('merge')
    setConfirmText('')
    setResult(null)
  }, [open, file])

  const replaceConfirmed = confirmText.trim().toUpperCase() === 'ЗАМЕНИТЬ'
  const canImport =
    file !== null && !busy && !uploading && (mode === 'merge' || replaceConfirmed)

  const handleImport = async () => {
    if (!canImport) return
    const nextResult = await onImport(mode)
    if (nextResult) setResult(nextResult)
  }

  const footer = result ? (
    <Button onClick={onClose}>Готово</Button>
  ) : (
    <>
      <Button variant="ghost" onClick={onClose} disabled={busy}>
        Отмена
      </Button>
      <Button
        variant={mode === 'replace' ? 'danger' : 'primary'}
        loading={busy}
        disabled={!canImport}
        onClick={() => void handleImport()}
      >
        {mode === 'replace' ? 'Заменить библиотеку' : 'Импортировать'}
      </Button>
    </>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={result ? 'Импорт завершён' : 'Импорт библиотеки'}
      description={file ? `Файл: ${file.name}` : undefined}
      size="md"
      closeOnBackdrop={!busy}
      footer={footer}
    >
      {result ? (
        <ImportReport result={result} />
      ) : (
        <div className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2" disabled={busy}>
            <legend className="mb-1 text-caption text-text-muted">Режим импорта</legend>

            <label
              className={clsx(
                'flex cursor-pointer items-start gap-3 rounded-control border p-3 transition-colors',
                mode === 'merge'
                  ? 'border-accent bg-accent/10'
                  : 'border-border bg-surface hover:border-border-strong',
              )}
            >
              <input
                type="radio"
                name="import-mode"
                value="merge"
                checked={mode === 'merge'}
                disabled={busy}
                onChange={() => setMode('merge')}
                className="mt-1 h-4 w-4 shrink-0 accent-accent"
              />
              <span>
                <span className="block text-body text-text">Объединить</span>
                <span className="block text-caption text-text-muted">
                  Добавит треки из архива и сохранит текущую библиотеку.
                </span>
              </span>
            </label>

            <label
              className={clsx(
                'flex cursor-pointer items-start gap-3 rounded-control border p-3 transition-colors',
                mode === 'replace'
                  ? 'border-danger bg-danger/10'
                  : 'border-border bg-surface hover:border-border-strong',
              )}
            >
              <input
                type="radio"
                name="import-mode"
                value="replace"
                checked={mode === 'replace'}
                disabled={busy}
                onChange={() => setMode('replace')}
                className="mt-1 h-4 w-4 shrink-0 accent-accent"
              />
              <span>
                <span className="block text-body text-text">Заменить</span>
                <span className="block text-caption text-text-muted">
                  Удалит текущую библиотеку и загрузит архив.
                </span>
              </span>
            </label>
          </fieldset>

          {mode === 'replace' && (
            <div
              role="alert"
              className="rounded-control border border-danger/40 bg-danger/10 p-3"
            >
              <p className="text-body font-medium text-danger">
                Текущая библиотека будет заменена
              </p>
              <p className="mt-1 text-caption text-text-muted">
                Все текущие биты и файлы будут удалены. Это действие нельзя отменить.
              </p>

              <div className="mt-3">
                <Input
                  label="Введите ЗАМЕНИТЬ, чтобы подтвердить"
                  placeholder="ЗАМЕНИТЬ"
                  value={confirmText}
                  autoComplete="off"
                  disabled={busy}
                  onChange={(event) => setConfirmText(event.target.value)}
                />
              </div>

              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                loading={exporting}
                disabled={busy}
                onClick={onExportFirst}
              >
                Сначала экспортировать копию
              </Button>
            </div>
          )}

          {busy && progress && <TransferStatus progress={progress} />}

          {uploading && (
            <p
              role="status"
              className="rounded-control border border-border-strong bg-bg-subtle px-3 py-2 text-caption text-text-muted"
            >
              Сначала дождитесь завершения загрузки файлов — импорт станет доступен
              после неё.
            </p>
          )}

          {errorMessage && (
            <p
              role="alert"
              className="rounded-control border border-danger/40 bg-danger/10 px-3 py-2 text-caption text-danger"
            >
              {errorMessage}
            </p>
          )}

          {!busy && !errorMessage && (
            <p className="text-caption text-text-muted">
              Импорт может занять время: файлы записываются в локальное хранилище.
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}
