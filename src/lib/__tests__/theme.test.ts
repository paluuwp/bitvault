import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ACCENT_PRESETS,
  ACCENT_STORAGE_KEY,
  DEFAULT_ACCENT,
  THEME_CHANGE_EVENT,
  applyAccent,
  contrastRatio,
  deriveAccentTokens,
  getStoredAccent,
  initTheme,
  storeAccent,
} from '../theme'

const HEX = /^#[0-9a-f]{6}$/

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
  document.documentElement.removeAttribute('style')
})

describe('deriveAccentTokens', () => {
  it('даёт валидные hex и rgb для всех пресетов', () => {
    for (const preset of ACCENT_PRESETS) {
      const t = deriveAccentTokens(preset.hex)
      expect(t.accent).toBe(preset.hex)
      for (const value of [t.hover, t.pressed, t.dim, t.focus, t.ink]) {
        expect(value).toMatch(HEX)
      }
      expect(t.rgb).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/)
    }
  })

  it('ink даёт контраст не ниже 4.5 для всех пресетов', () => {
    for (const preset of ACCENT_PRESETS) {
      const t = deriveAccentTokens(preset.hex)
      expect(contrastRatio(t.accent, t.ink), preset.label).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('оранжевый по умолчанию: rgb и тёмный ink', () => {
    const t = deriveAccentTokens(DEFAULT_ACCENT)
    expect(t.rgb).toBe('247 147 30')
    expect(t.ink).toBe('#14100a')
  })
})

describe('applyAccent', () => {
  it('выставляет переменные и диспатчит событие', () => {
    const listener = vi.fn()
    window.addEventListener(THEME_CHANGE_EVENT, listener)
    applyAccent('#4c8dff')
    window.removeEventListener(THEME_CHANGE_EVENT, listener)

    const style = document.documentElement.style
    expect(style.getPropertyValue('--color-accent')).toBe('#4c8dff')
    expect(style.getPropertyValue('--accent-rgb')).toBe('76 141 255')
    for (const name of [
      '--color-accent-hover',
      '--color-accent-pressed',
      '--color-accent-dim',
      '--color-accent-ink',
      '--color-focus',
    ]) {
      expect(style.getPropertyValue(name)).toMatch(HEX)
    }
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('игнорирует невалидное значение', () => {
    const listener = vi.fn()
    window.addEventListener(THEME_CHANGE_EVENT, listener)
    applyAccent('red')
    window.removeEventListener(THEME_CHANGE_EVENT, listener)
    expect(document.documentElement.style.getPropertyValue('--color-accent')).toBe('')
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('хранилище акцента', () => {
  it('сохраняет и читает значение', () => {
    storeAccent('#34D17A')
    expect(getStoredAccent()).toBe('#34d17a')
  })

  it('невалидное значение в localStorage игнорируется', () => {
    window.localStorage.setItem(ACCENT_STORAGE_KEY, 'javascript:alert(1)')
    expect(getStoredAccent()).toBeNull()
    initTheme()
    expect(document.documentElement.style.getPropertyValue('--color-accent')).toBe('')
  })

  it('исключения localStorage не приводят к падению', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(() => storeAccent('#4c8dff')).not.toThrow()
    expect(getStoredAccent()).toBeNull()
    expect(() => initTheme()).not.toThrow()
  })

  it('initTheme применяет сохранённый недефолтный акцент', () => {
    storeAccent('#a974ff')
    initTheme()
    expect(document.documentElement.style.getPropertyValue('--color-accent')).toBe('#a974ff')
  })
})
