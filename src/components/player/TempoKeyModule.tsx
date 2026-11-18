import { clsx } from 'clsx'
import { formatBpmValue, formatMusicalKeyValue, formatTempoKeySummary } from '@/lib/format'
import type { MusicalKey } from '@/types/models'

export interface TempoKeyModuleProps {
  bpm: number | null
  musicalKey: MusicalKey | null
  /** Две половины равной ширины: разделитель ровно по центру блока (для плеера). */
  evenHalves?: boolean
  className?: string
}

const valueClass = 'font-mono text-body font-semibold tabular-nums text-text'
const labelClass = 'text-micro text-text-muted'

/** Темп и тональность текущего бита в плеере: чистый текст без рамок и заливок. */
export function TempoKeyModule({
  bpm,
  musicalKey,
  evenHalves = false,
  className,
}: TempoKeyModuleProps) {
  const halfClass = clsx('flex items-baseline gap-1', evenHalves && 'flex-1 justify-center')

  return (
    <div
      role="group"
      aria-label={formatTempoKeySummary(bpm, musicalKey)}
      className={clsx(
        'flex shrink-0 items-baseline whitespace-nowrap',
        evenHalves ? 'gap-2' : 'gap-3',
        className,
      )}
    >
      <span className={halfClass}>
        <span aria-hidden="true" className={valueClass}>
          {formatBpmValue(bpm)}
        </span>
        <span aria-hidden="true" className={labelClass}>
          BPM
        </span>
      </span>
      <span aria-hidden="true" className="h-3 w-px self-center bg-white/15" />
      <span className={halfClass}>
        <span aria-hidden="true" className={clsx(valueClass, 'text-accent')}>
          {formatMusicalKeyValue(musicalKey)}
        </span>
        <span aria-hidden="true" className={clsx(labelClass, 'uppercase')}>
          Key
        </span>
      </span>
    </div>
  )
}
