import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TrackRow } from './TrackRow'
import { makeTrack } from '@/test/factories'
import { renderWithProviders } from '@/test/render'

describe('TrackRow', () => {
  it('показывает название, BPM с тональностью, длительность, play и избранное', () => {
    const track = makeTrack({
      name: 'Night Drive',
      bpm: 140,
      musicalKey: 'F#m',
      durationSec: 178,
      audioFileId: 'audio-1',
    })
    renderWithProviders(
      <ul>
        <TrackRow track={track} />
      </ul>,
    )

    expect(screen.getByText('Night Drive')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: '140 BPM, тональность F#m' })).toBeInTheDocument()
    expect(screen.getByText('140')).toBeInTheDocument()
    expect(screen.getByText('F#m')).toBeInTheDocument()
    expect(screen.getByText('2:58')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Воспроизвести «Night Drive»' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Добавить «Night Drive» в избранное' }),
    ).toBeInTheDocument()
  })

  it('для пустого темпа и тональности показывает прочерки и подпись', () => {
    const track = makeTrack({
      name: 'Без метаданных',
      bpm: null,
      musicalKey: null,
      audioFileId: 'audio-1',
    })
    renderWithProviders(
      <ul>
        <TrackRow track={track} />
      </ul>,
    )

    expect(
      screen.getByRole('group', { name: 'Темп не указан, тональность не указана' }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('—')).toHaveLength(2)
  })

  it('показывает автора перед жанром, а без автора подпись начинается с жанра', () => {
    const { unmount } = renderWithProviders(
      <ul>
        <TrackRow track={makeTrack({ author: 'Lil Test', genre: 'Trap' })} />
      </ul>,
    )
    expect(screen.getByText(/^Lil Test · Trap · /)).toBeInTheDocument()
    unmount()

    renderWithProviders(
      <ul>
        <TrackRow track={makeTrack({ author: null, genre: 'Trap' })} />
      </ul>,
    )
    expect(screen.getByText(/^Trap · /)).toBeInTheDocument()
  })

  it('запускает воспроизведение и переключает избранное', async () => {
    const track = makeTrack({ name: 'Night Drive', audioFileId: 'audio-1' })
    const onPlay = vi.fn()
    const onToggleFavorite = vi.fn()
    const { user } = renderWithProviders(
      <ul>
        <TrackRow track={track} onPlay={onPlay} onToggleFavorite={onToggleFavorite} />
      </ul>,
    )

    await user.click(screen.getByRole('button', { name: 'Воспроизвести «Night Drive»' }))
    await user.click(
      screen.getByRole('button', { name: 'Добавить «Night Drive» в избранное' }),
    )

    expect(onPlay).toHaveBeenCalledTimes(1)
    expect(onPlay).toHaveBeenCalledWith(track)
    expect(onToggleFavorite).toHaveBeenCalledTimes(1)
    expect(onToggleFavorite).toHaveBeenCalledWith(track)
  })
})
