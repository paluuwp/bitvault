export interface AccentPreset {
  id: string
  label: string
  hex: string
}

export const DEFAULT_ACCENT = '#f7931e'
export const ACCENT_STORAGE_KEY = 'bv.theme.accent'
export const THEME_CHANGE_EVENT = 'bv-theme-change'

export const ACCENT_PRESETS: readonly AccentPreset[] = [
  { id: 'orange', label: 'Оранжевый', hex: '#f7931e' },
  { id: 'red', label: 'Красный', hex: '#ff4d4d' },
  { id: 'pink', label: 'Розовый', hex: '#ff5fa2' },
  { id: 'purple', label: 'Фиолетовый', hex: '#a974ff' },
  { id: 'blue', label: 'Синий', hex: '#4c8dff' },
  { id: 'cyan', label: 'Голубой', hex: '#2cc4f0' },
  { id: 'green', label: 'Зелёный', hex: '#34d17a' },
  { id: 'yellow', label: 'Жёлтый', hex: '#f5d90a' },
]

export interface AccentTokens {
  accent: string
  hover: string
  pressed: string
  dim: string
  focus: string
  ink: string
  /** Компоненты цвета через пробел: "r g b". */
  rgb: string
}

const HEX_RE = /^#[0-9a-f]{6}$/i
const INK_DARK = '#14100a'
const INK_LIGHT = '#ffffff'

export function isValidHex(value: unknown): value is string {
  return typeof value === 'string' && HEX_RE.test(value)
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

function rgbToHex(r: number, g: number, b: number): string {
  const part = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0')
  return `#${part(r)}${part(g)}${part(b)}`
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return [0, 0, l]
  const s = d / (1 - Math.abs(2 * l - 1))
  let h: number
  if (max === rn) h = ((gn - bn) / d) % 6
  else if (max === gn) h = (bn - rn) / d + 2
  else h = (rn - gn) / d + 4
  return [(h * 60 + 360) % 360, s, l]
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255)
}

/** Относительная яркость по WCAG 2.x. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Контрастность двух цветов по WCAG (1..21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** Цвет текста на акценте: тёмный или белый — с лучшим контрастом. */
function pickInk(accent: string): string {
  return contrastRatio(accent, INK_DARK) >= contrastRatio(accent, INK_LIGHT) ? INK_DARK : INK_LIGHT
}

export function deriveAccentTokens(hex: string): AccentTokens {
  const base = isValidHex(hex) ? hex.toLowerCase() : DEFAULT_ACCENT
  const [r, g, b] = hexToRgb(base)
  const [h, s, l] = rgbToHsl(r, g, b)
  const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
  return {
    accent: base,
    hover: hslToHex(h, s, clamp01(l + 0.07)),
    pressed: hslToHex(h, s, clamp01(l - 0.07)),
    dim: hslToHex(h, Math.min(s, 0.6), 0.13),
    focus: hslToHex(h, Math.max(s, 0.5), 0.78),
    ink: pickInk(base),
    rgb: `${r} ${g} ${b}`,
  }
}

/** Выставляет акцент на documentElement и уведомляет подписчиков. Невалидный hex игнорируется. */
export function applyAccent(hex: string): void {
  if (!isValidHex(hex) || typeof document === 'undefined') return
  const t = deriveAccentTokens(hex)
  const style = document.documentElement.style
  style.setProperty('--color-accent', t.accent)
  style.setProperty('--color-accent-hover', t.hover)
  style.setProperty('--color-accent-pressed', t.pressed)
  style.setProperty('--color-accent-dim', t.dim)
  style.setProperty('--color-accent-ink', t.ink)
  style.setProperty('--color-focus', t.focus)
  style.setProperty('--accent-rgb', t.rgb)
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { accent: t.accent } }))
}

export function getStoredAccent(): string | null {
  try {
    const value = window.localStorage.getItem(ACCENT_STORAGE_KEY)
    return isValidHex(value) ? value.toLowerCase() : null
  } catch {
    return null
  }
}

export function storeAccent(hex: string): void {
  if (!isValidHex(hex)) return
  try {
    window.localStorage.setItem(ACCENT_STORAGE_KEY, hex.toLowerCase())
  } catch {
    // Хранилище может быть недоступно — выбор действует до перезагрузки.
  }
}

/** Применяет сохранённый акцент (если он не дефолтный). Вызывать до первого рендера. */
export function initTheme(): void {
  const stored = getStoredAccent()
  if (stored && stored !== DEFAULT_ACCENT) applyAccent(stored)
}
