import { describe, expect, it } from 'vitest'
import { formatBytes, formatDate, formatDuration, formatPlayCount, safeTrim } from '../format'

describe('formatDuration', () => {
  it('форматирует минуты и секунды', () => {
    expect(formatDuration(0)).toBe('00:00')
    expect(formatDuration(5)).toBe('00:05')
    expect(formatDuration(65)).toBe('01:05')
    expect(formatDuration(3599)).toBe('59:59')
  })

  it('добавляет часы', () => {
    expect(formatDuration(3600)).toBe('1:00:00')
    expect(formatDuration(3661)).toBe('1:01:01')
  })

  it('возвращает прочерк для отсутствующего значения', () => {
    expect(formatDuration(null)).toBe('—')
    expect(formatDuration(undefined)).toBe('—')
    expect(formatDuration(-1)).toBe('—')
    expect(formatDuration(Number.NaN)).toBe('—')
  })
})

describe('formatBytes', () => {
  it('использует русские сокращения', () => {
    expect(formatBytes(0)).toBe('0 Б')
    expect(formatBytes(512)).toBe('512 Б')
    expect(formatBytes(1024)).toBe('1 КБ')
    expect(formatBytes(1024 * 1024)).toBe('1 МБ')
    expect(formatBytes(250 * 1024 * 1024)).toBe('250 МБ')
  })

  it('показывает дробную часть через запятую', () => {
    expect(formatBytes(1536)).toBe('1,5 КБ')
  })

  it('возвращает прочерк для отсутствующего значения', () => {
    expect(formatBytes(null)).toBe('—')
    expect(formatBytes(-10)).toBe('—')
  })
})

describe('formatDate', () => {
  const now = new Date(2026, 10, 15, 12, 0, 0)

  it('распознаёт сегодня и вчера', () => {
    expect(formatDate(new Date(2026, 10, 15, 1, 0, 0), now)).toBe('Сегодня')
    expect(formatDate(new Date(2026, 10, 14, 23, 0, 0), now)).toBe('Вчера')
  })

  it('форматирует старую дату', () => {
    expect(formatDate(new Date(2026, 9, 5, 9, 0, 0), now)).toBe('05.10.2026')
  })

  it('принимает ISO-строку и обрабатывает мусор', () => {
    expect(formatDate(new Date(2026, 10, 15, 1, 0, 0).toISOString(), now)).toBe('Сегодня')
    expect(formatDate('not-a-date')).toBe('—')
    expect(formatDate(null)).toBe('—')
  })
})

describe('formatPlayCount', () => {
  it('склоняет слово «прослушивание»', () => {
    expect(formatPlayCount(0)).toBe('0 прослушиваний')
    expect(formatPlayCount(1)).toBe('1 прослушивание')
    expect(formatPlayCount(2)).toBe('2 прослушивания')
    expect(formatPlayCount(5)).toBe('5 прослушиваний')
    expect(formatPlayCount(11)).toBe('11 прослушиваний')
    expect(formatPlayCount(21)).toBe('21 прослушивание')
  })

  it('заменяет некорректное значение нулём', () => {
    expect(formatPlayCount(null)).toBe('0 прослушиваний')
    expect(formatPlayCount(-2)).toBe('0 прослушиваний')
  })
})

describe('safeTrim', () => {
  it('безопасно обрабатывает неизвестные значения', () => {
    expect(safeTrim('  text  ')).toBe('text')
    expect(safeTrim('   ')).toBe('')
    expect(safeTrim(null)).toBe('')
    expect(safeTrim(42)).toBe('')
  })
})
