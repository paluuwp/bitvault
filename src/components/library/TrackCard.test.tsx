import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TrackCard } from './TrackCard'
import { makeTrack } from '@/test/factories'
import { renderWithProviders } from '@/test/render'

describe('TrackCard', () => {
  it('показывает название, BPM и длительность', () => {
    const track = makeTrack({
      name: 'Night Drive',
      bpm: 140,
      durationSec: 178,
      audioFileId: 'audio-1',
    })
    renderWithProviders(<TrackCard track={track} />)

    expect(screen.getByText('Night Drive')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: '140 BPM, тональность F#m' })).toBeInTheDocument()
    expect(screen.getByText('140')).toBeInTheDocument()
    expect(screen.getByText('F#m')).toBeInTheDocument()
    expect(screen.getByText('2:58')).toBeInTheDocument()
  })

  it('вызывает onPlay по кнопке воспроизведения и не открывает карточку', async () => {
    const track = makeTrack({ name: 'Night Drive', audioFileId: 'audio-1' })
    const onPlay = vi.fn()
    const onOpen = vi.fn()
    const { user } = renderWithProviders(
      <TrackCard track={track} onPlay={onPlay} onOpen={onOpen} />,
    )

    await user.click(screen.getByRole('button', { name: 'Воспроизвести «Night Drive»' }))

    expect(onPlay).toHaveBeenCalledTimes(1)
    expect(onPlay).toHaveBeenCalledWith(track)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('открывает карточку по клику на саму карточку', async () => {
    const track = makeTrack({ name: 'Night Drive', audioFileId: 'audio-1' })
    const onOpen = vi.fn()
    const { user } = renderWithProviders(<TrackCard track={track} onOpen={onOpen} />)

    await user.click(screen.getByRole('article'))

    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpen).toHaveBeenCalledWith(track)
  })

  it('переключает избранное, не всплывая до открытия карточки', async () => {
    const track = makeTrack({ name: 'Night Drive', isFavorite: false })
    const onToggleFavorite = vi.fn()
    const onOpen = vi.fn()
    const { user } = renderWithProviders(
      <TrackCard track={track} onToggleFavorite={onToggleFavorite} onOpen={onOpen} />,
    )

    await user.click(
      screen.getByRole('button', { name: 'Добавить «Night Drive» в избранное' }),
    )

    expect(onToggleFavorite).toHaveBeenCalledTimes(1)
    expect(onToggleFavorite).toHaveBeenCalledWith(track)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('для трека без аудио показывает «Файл проекта» и не показывает play', () => {
    const track = makeTrack({ name: 'Проект', audioFileId: null, durationSec: null })
    renderWithProviders(<TrackCard track={track} />)

    expect(screen.getByText('Файл проекта')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Воспроизвести/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Открыть «Проект»' })).toBeInTheDocument()
  })

  it('в disabled-состоянии не вызывает обработчики', async () => {
    const track = makeTrack({ name: 'Night Drive', audioFileId: 'audio-1' })
    const onPlay = vi.fn()
    const onOpen = vi.fn()
    const onToggleFavorite = vi.fn()
    const { user } = renderWithProviders(
      <TrackCard
        track={track}
        disabled
        onPlay={onPlay}
        onOpen={onOpen}
        onToggleFavorite={onToggleFavorite}
      />,
    )

    expect(screen.getByRole('button', { name: 'Воспроизвести «Night Drive»' })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Добавить «Night Drive» в избранное' }),
    ).toBeDisabled()

    await user.click(screen.getByRole('article'))

    expect(onPlay).not.toHaveBeenCalled()
    expect(onOpen).not.toHaveBeenCalled()
    expect(onToggleFavorite).not.toHaveBeenCalled()
  })
})
