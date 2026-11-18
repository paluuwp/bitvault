import { TempoKeyModule } from '@/components/player/TempoKeyModule'
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
  // В строке списка — тот же минималистичный вид, что и в плеере.
  if (variant === 'row') {
    return <TempoKeyModule bpm={bpm} musicalKey={musicalKey} className={className} />
  }

  return (
    <Readout
      items={[
        { label: 'BPM', value: formatBpmValue(bpm) },
        { label: 'KEY', value: formatMusicalKeyValue(musicalKey) },
      ]}
      variant="overlay"
      size="xs"
      label={formatTempoKeySummary(bpm, musicalKey)}
      className={className}
    />
  )
}
