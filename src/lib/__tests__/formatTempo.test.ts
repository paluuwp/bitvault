import { describe, expect, it } from 'vitest'
import {
  formatBpmLabel,
  formatBpmValue,
  formatMusicalKeyLabel,
  formatMusicalKeyValue,
  formatTempoKeySummary,
} from '../format'

describe('форматтеры темпа и тональности', () => {
  it('показывает BPM числом и с подписью', () => {
    expect(formatBpmValue(140)).toBe('140')
    expect(formatBpmValue(89.6)).toBe('90')
    expect(formatBpmLabel(140)).toBe('140 BPM')
  })

  it('для пустого BPM ставит прочерк и понятную подпись', () => {
    expect(formatBpmValue(null)).toBe('—')
    expect(formatBpmValue(undefined)).toBe('—')
    expect(formatBpmValue(0)).toBe('—')
    expect(formatBpmLabel(null)).toBe('Темп не указан')
  })

  it('показывает тональность в нотации FL Studio', () => {
    expect(formatMusicalKeyValue('F#m')).toBe('F#m')
    expect(formatMusicalKeyValue(null)).toBe('—')
    expect(formatMusicalKeyLabel('C#')).toBe('Тональность: C#')
    expect(formatMusicalKeyLabel(null)).toBe('Тональность не указана')
  })

  it('собирает сводку для aria-label', () => {
    expect(formatTempoKeySummary(140, 'F#m')).toBe('140 BPM, тональность F#m')
    expect(formatTempoKeySummary(null, null)).toBe(
      'Темп не указан, тональность не указана',
    )
  })
})
