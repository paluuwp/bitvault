import { ProgressBar } from '@/components/ui'
import type { UploadProgressState } from '@/hooks/useUpload'

export interface UploadProgressProps {
  progress: UploadProgressState
}

export function UploadProgress({ progress }: UploadProgressProps) {
  const { current, total, label } = progress
  const safeTotal = total > 0 ? total : 1
  const clamped = Math.min(Math.max(current, 0), safeTotal)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-body text-text">
          Обработано {clamped} из {total}
        </span>
        <span className="min-w-0 truncate text-caption text-text-muted" title={label}>
          {label}
        </span>
      </div>
      <ProgressBar
        value={clamped}
        max={total}
        label={`Добавление файлов: ${label}`}
      />
    </div>
  )
}
