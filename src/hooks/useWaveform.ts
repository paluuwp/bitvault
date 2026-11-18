import { useEffect, useState } from 'react'
import { getFileUrl } from '@/lib'
import {
  WAVEFORM_MAX_BYTES,
  WAVEFORM_MAX_DURATION_SEC,
  computePeaks,
  getCachedPeaks,
  hasRecentWaveformFailure,
  loadPeaksShared,
} from '@/lib/waveform'

export interface WaveformState {
  peaks: number[] | null
  loading: boolean
}

interface InternalState extends WaveformState {
  key: string | null
}

/** Скачивает и декодирует файл; blob URL освобождается в любом случае. */
async function fetchPeaks(fileId: string, bars: number): Promise<number[] | null> {
  if (typeof fetch !== 'function') return null
  const handle = await getFileUrl(fileId)
  try {
    const response = await fetch(handle.url)
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined)
      return null
    }
    const lengthHeader = response.headers.get('Content-Length')
    if (lengthHeader !== null) {
      const length = Number(lengthHeader)
      if (Number.isFinite(length) && length > WAVEFORM_MAX_BYTES) {
        void response.body?.cancel().catch(() => undefined)
        return null
      }
    }
    const buffer = await response.arrayBuffer()
    return await computePeaks(buffer, bars)
  } finally {
    handle.revoke()
  }
}

/**
 * Пики волны для файла; при любой ошибке возвращает peaks = null (будет заглушка).
 * durationSec — известная длительность трека: слишком длинные не декодируем.
 */
export function useWaveform(
  fileId: string | null | undefined,
  bars: number,
  durationSec?: number | null,
): WaveformState {
  const key = fileId ? `${fileId}:${bars}` : null
  const [state, setState] = useState<InternalState>({ key: null, peaks: null, loading: false })
  const tooLong =
    typeof durationSec === 'number' &&
    Number.isFinite(durationSec) &&
    durationSec > WAVEFORM_MAX_DURATION_SEC

  useEffect(() => {
    if (!fileId) return
    const stateKey = `${fileId}:${bars}`

    const cached = getCachedPeaks(fileId, bars)
    if (cached) {
      setState({ key: stateKey, peaks: cached, loading: false })
      return
    }
    if (tooLong || hasRecentWaveformFailure(fileId, bars)) {
      setState({ key: stateKey, peaks: null, loading: false })
      return
    }

    let cancelled = false
    setState({ key: stateKey, peaks: null, loading: true })

    // Загрузка общая для всех подписчиков (дедупликация), поэтому при размонтировании
    // её не отменяем: результат попадёт в кэш, а blob URL освободится в fetchPeaks.
    void loadPeaksShared(fileId, bars, () => fetchPeaks(fileId, bars)).then((peaks) => {
      if (cancelled) return
      setState({ key: stateKey, peaks, loading: false })
    })

    return () => {
      cancelled = true
    }
  }, [fileId, bars, tooLong])

  // Результат от предыдущего трека не показываем до окончания загрузки нового.
  if (!key) return { peaks: null, loading: false }
  if (state.key !== key) return { peaks: null, loading: true }
  return { peaks: state.peaks, loading: state.loading }
}
