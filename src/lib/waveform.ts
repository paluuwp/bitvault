/** Максимальный размер файла, который декодируем ради волны (байты). */
export const WAVEFORM_MAX_BYTES = 60 * 1024 * 1024
/** Треки длиннее этого порога не декодируем (секунды). */
export const WAVEFORM_MAX_DURATION_SEC = 20 * 60
const CACHE_LIMIT = 20
/** Сколько помнить неудачу (мс), чтобы не качать файл повторно. */
const NEGATIVE_TTL_MS = 60_000
/** Максимальный шаг по сэмплам внутри окна. */
const MAX_STEP = 64

const cache = new Map<string, number[]>()
const negativeCache = new Map<string, number>()
const inflight = new Map<string, Promise<number[] | null>>()

function makeKey(fileId: string, bars: number): string {
  return `${fileId}:${bars}`
}

export function getCachedPeaks(fileId: string, bars: number): number[] | null {
  return cache.get(makeKey(fileId, bars)) ?? null
}

export function setCachedPeaks(fileId: string, bars: number, peaks: number[]): void {
  const key = makeKey(fileId, bars)
  cache.delete(key)
  cache.set(key, peaks)
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

/** true, если недавняя попытка получить пики завершилась неудачей. */
export function hasRecentWaveformFailure(fileId: string, bars: number): boolean {
  const key = makeKey(fileId, bars)
  const until = negativeCache.get(key)
  if (until === undefined) return false
  if (Date.now() >= until) {
    negativeCache.delete(key)
    return false
  }
  return true
}

export function markWaveformFailure(fileId: string, bars: number): void {
  negativeCache.set(makeKey(fileId, bars), Date.now() + NEGATIVE_TTL_MS)
}

/**
 * Дедупликация: параллельные запросы с одним ключом делят один Promise.
 * Успех кладётся в LRU, null — в негативный кэш на ~60 с.
 */
export function loadPeaksShared(
  fileId: string,
  bars: number,
  loader: () => Promise<number[] | null>,
): Promise<number[] | null> {
  const key = makeKey(fileId, bars)
  const existing = inflight.get(key)
  if (existing) return existing

  const promise = loader()
    .catch(() => null)
    .then((peaks) => {
      if (peaks) setCachedPeaks(fileId, bars, peaks)
      else markWaveformFailure(fileId, bars)
      return peaks
    })
    .finally(() => {
      inflight.delete(key)
    })
  inflight.set(key, promise)
  return promise
}

interface Decoder {
  decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer>
  close?: () => Promise<void>
  state?: string
}

type DecoderCtor = new () => Decoder
type OfflineCtor = new (channels: number, length: number, sampleRate: number) => Decoder

function createDecoder(): Decoder | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    OfflineAudioContext?: OfflineCtor
    webkitOfflineAudioContext?: OfflineCtor
    AudioContext?: DecoderCtor
    webkitAudioContext?: DecoderCtor
  }
  try {
    const Offline = w.OfflineAudioContext ?? w.webkitOfflineAudioContext
    if (Offline) return new Offline(1, 1, 44100)
    const Ctor = w.AudioContext ?? w.webkitAudioContext
    if (Ctor) return new Ctor()
  } catch {
    return null
  }
  return null
}

/**
 * Декодирует аудио и возвращает `bars` нормализованных пиков (0..1).
 * При любой проблеме (нет AudioContext, большой файл, ошибка декодирования) вернёт null.
 */
export async function computePeaks(
  arrayBuffer: ArrayBuffer,
  bars: number,
): Promise<number[] | null> {
  if (bars <= 0) return null
  if (arrayBuffer.byteLength === 0 || arrayBuffer.byteLength > WAVEFORM_MAX_BYTES) return null

  const context = createDecoder()
  if (!context) return null
  try {
    const buffer = await context.decodeAudioData(arrayBuffer)
    const channels: Float32Array[] = []
    for (let c = 0; c < buffer.numberOfChannels; c += 1) channels.push(buffer.getChannelData(c))
    const length = buffer.length
    if (length === 0 || channels.length === 0) return null

    const blockSize = length / bars
    const peaks = new Array<number>(bars).fill(0)
    for (let i = 0; i < bars; i += 1) {
      const start = Math.min(length - 1, Math.floor(i * blockSize))
      const end = Math.max(start + 1, Math.min(length, Math.floor((i + 1) * blockSize)))
      const step = Math.min(MAX_STEP, Math.max(1, Math.floor((end - start) / 8)))
      let max = 0
      for (const data of channels) {
        for (let j = start; j < end; j += step) {
          const v = Math.abs(data[j] ?? 0)
          if (v > max) max = v
        }
      }
      peaks[i] = max
    }

    let top = 0
    for (const p of peaks) if (p > top) top = p
    if (top <= 0) return peaks
    return peaks.map((p) => p / top)
  } catch {
    return null
  } finally {
    if (typeof context.close === 'function' && context.state !== 'closed') {
      try {
        // OfflineAudioContext.close отсутствует в части браузеров.
        void Promise.resolve(context.close()).catch(() => undefined)
      } catch {
        // Закрытие контекста не критично.
      }
    }
  }
}
