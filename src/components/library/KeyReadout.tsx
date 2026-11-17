import { Readout } from '@/components/ui'
import { formatBpmValue, formatMusicalKeyValue, formatTempoKeySummary } from '@/lib/format'
import type { MusicalKey } from '@/types/models'

export interface KeyReadoutProps {
  bpm: number | null
  musicalKey: MusicalKey | null
  /** `row` — в строке списка, `overlay` — поверх обложки карточки. */
  variant?: 'row' | 'overlay'
  className?: string
}

/** Пара BPM + тональность рядом, с прочерками для незаполненных полей. */
export function KeyReadout({
  bpm,
  musicalKey,
  variant = 'row',
  className,
}: KeyReadoutProps) {
  return (
    <Readout
      items={[
        { label: 'BPM', value: formatBpmValue(bpm) },
        { label: 'KEY', value: formatMusicalKeyValue(musicalKey) },
      ]}
      variant={variant === 'overlay' ? 'overlay' : 'inset'}
      size={variant === 'overlay' ? 'xs' : 'sm'}
      label={formatTempoKeySummary(bpm, musicalKey)}
      className={className}
    />
  )
}
