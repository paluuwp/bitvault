import { clsx } from 'clsx'
import { formatBpmValue, formatMusicalKeyValue, formatTempoKeySummary } from '@/lib/format'
import type { MusicalKey } from '@/types/models'

export interface TempoKeyModuleProps {
  bpm: number | null
  musicalKey: MusicalKey | null
  className?: string
}

/** Плашка плеера с темпом и тональностью текущего бита: две ячейки через разделитель. */
export function TempoKeyModule({ bpm, musicalKey, className }: TempoKeyModuleProps) {
  return (
    <div
      role="group"
      aria-label={formatTempoKeySummary(bpm, musicalKey)}
      className={clsx(
        'flex h-8 shrink-0 items-stretch overflow-hidden rounded-control border border-divider/70 bg-surface-raised/40 shadow-bevel backdrop-blur-sm',
        className,
      )}
    >
      <span className="flex w-14 flex-col items-center justify-center gap-0.5">
        <span aria-hidden="true" className="text-micro text-text-subtle uppercase">
          BPM
        </span>
        <span
          aria-hidden="true"
          className="font-mono text-caption leading-none font-semibold tabular-nums text-text"
        >
          {formatBpmValue(bpm)}
        </span>
      </span>
      <span aria-hidden="true" className="my-1.5 w-px shrink-0 bg-divider" />
      <span className="flex w-14 flex-col items-center justify-center gap-0.5">
        <span aria-hidden="true" className="text-micro text-text-subtle uppercase">
          Key
        </span>
        <span
          aria-hidden="true"
          className="font-mono text-caption leading-none font-semibold tabular-nums text-text"
        >
          {formatMusicalKeyValue(musicalKey)}
        </span>
      </span>
    </div>
  )
}
