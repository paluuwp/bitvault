import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PlayerBar } from './PlayerBar'

// Контекст плеера подменяем на статические данные: реальный PlayerProvider
// создаёт <audio> и загружает файлы из IndexedDB, что для вёрстки полосы не нужно.
const playerState = vi.hoisted(() => ({
  hasTrack: true,
  positionSec: 83,
  durationSec: 225,
}))
const controls = vi.hoisted(() => ({
  togglePlay: vi.fn(),
  seekTo: vi.fn(),
  next: vi.fn(),
  prev: vi.fn(),
  setVolume: vi.fn(),
}))

vi.mock('@/context/PlayerContext', async () => {
  const { makeTrack } = await import('@/test/factories')
  const track = makeTrack({
    id: 'track-current',
    name: 'Night Drive',
    bpm: 140,
    musicalKey: 'F#m',
    genre: 'Trap',
    audioFileId: 'audio-1',
    durationSec: 225,
  })
  const nextTrack = makeTrack({
    id: 'track-next',
    name: 'Next Beat',
    audioFileId: 'audio-2',
  })

  return {
    usePlayerTrack: () => ({
      currentTrack: playerState.hasTrack ? track : null,
      queue: playerState.hasTrack ? [track, nextTrack] : [],
      isPlaying: false,
      loading: false,
      error: null,
    }),
    usePlayerProgress: () => ({
      positionSec: playerState.positionSec,
      durationSec: playerState.durationSec,
      volume: 0.6,
    }),
    usePlayerControls: () => controls,
  }
})

describe('PlayerBar', () => {
  beforeEach(() => {
    playerState.hasTrack = true
    playerState.positionSec = 83
    playerState.durationSec = 225
    vi.clearAllMocks()
  })

  it('показывает трек, время и модуль BPM/KEY', () => {
    render(<PlayerBar />)

    expect(screen.getByText('Night Drive')).toBeInTheDocument()
    expect(screen.getByText('Trap')).toBeInTheDocument()
    // До md BPM и тональность живут в мета-строке, с md — в модуле BPM/KEY.
    expect(screen.getByText(/140 BPM/)).toBeInTheDocument()
    expect(screen.getByRole('group', { name: '140 BPM, тональность F#m' })).toBeInTheDocument()
    expect(screen.getByText('01:23')).toBeInTheDocument()
    expect(screen.getByText('03:45')).toBeInTheDocument()
    expect(
      screen.getByRole('slider', { name: 'Прогресс воспроизведения' }),
    ).toHaveAttribute('aria-valuetext', '01:23 из 03:45')
    expect(screen.getByRole('button', { name: 'Выключить звук' })).toBeEnabled()
  })

  it('показывает часы в подписи времени', () => {
    playerState.durationSec = 3725
    render(<PlayerBar />)

    expect(
      screen.getByRole('slider', { name: 'Прогресс воспроизведения' }),
    ).toHaveAttribute('aria-valuetext', '01:23 из 1:02:05')
    expect(screen.getByText('1:02:05')).toBeInTheDocument()
  })

  it('показывает ползунки перемотки и громкости', () => {
    render(<PlayerBar />)

    expect(screen.getByRole('slider', { name: 'Прогресс воспроизведения' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Громкость' })).toBeInTheDocument()
  })

  it('рендерит один набор кнопок транспорта', () => {
    render(<PlayerBar />)

    for (const label of ['Предыдущий трек', 'Следующий трек', 'Воспроизвести']) {
      expect(screen.getByRole('button', { name: label })).toBeEnabled()
    }
  })

  it('не занимает место, пока ничего не играет', () => {
    playerState.hasTrack = false
    const { container } = render(<PlayerBar />)

    expect(container).toBeEmptyDOMElement()
  })

  it('перехватывает пробел для паузы, когда трек выбран', () => {
    render(<PlayerBar />)

    const dispatched = fireEvent.keyDown(document, { code: 'Space', key: ' ' })

    expect(controls.togglePlay).toHaveBeenCalledTimes(1)
    expect(dispatched).toBe(false)
  })

  it('не перехватывает пробел, пока трек не выбран', () => {
    playerState.hasTrack = false
    render(<PlayerBar />)

    const dispatched = fireEvent.keyDown(document, { code: 'Space', key: ' ' })

    expect(controls.togglePlay).not.toHaveBeenCalled()
    expect(dispatched).toBe(true)
  })
})
