import { ProgressBar } from '@/components/ui'
import type { TransferProgress } from '@/types/models'

const phaseLabels: Record<TransferProgress['phase'], string> = {
  prepare: 'Подготовка',
  read: 'Чтение',
  write: 'Запись',
  finish: 'Завершение',
}

export interface TransferStatusProps {
  progress: TransferProgress
}

/** Прогресс экспорта или импорта с подписью текущего этапа. */
export function TransferStatus({ progress }: TransferStatusProps) {
  const total = progress.total > 0 ? progress.total : 1
  const current = Math.min(Math.max(progress.current, 0), total)
  const counter = progress.total > 0 ? ` · ${current} из ${progress.total}` : ''

  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="inline-flex shrink-0 items-center gap-1.5 text-caption tabular-nums text-text-muted">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-play" />
          {phaseLabels[progress.phase]}
          {counter}
        </span>
        <span className="min-w-0 truncate text-caption text-text" title={progress.label}>
          {progress.label}
        </span>
      </div>
      <ProgressBar value={current} max={total} label={progress.label} />
    </div>
  )
}
