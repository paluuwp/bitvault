import { UploadProgress } from './UploadProgress'
import type { UploadProgressState } from '@/hooks/useUpload'

export interface UploadOverlayProps {
  progress: UploadProgressState | null
}

/** Ненавязчивый индикатор очереди загрузки в правом верхнем углу. */
export function UploadOverlay({ progress }: UploadOverlayProps) {
  if (!progress) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-20 right-4 z-40 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-card border border-control-border bg-surface shadow-popover"
    >
      <div className="fl-titlebar">Добавление битов</div>
      <div className="p-4">
        <UploadProgress progress={progress} />
      </div>
    </div>
  )
}
