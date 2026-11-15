import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TrackDetailDrawer } from './TrackDetailDrawer'
import { makeTrack } from '@/test/factories'
import { renderWithProviders } from '@/test/render'

function setup() {
  const track = makeTrack({
    id: 'track-detail',
    name: 'Old name',
    bpm: 120,
    genre: 'Trap',
    tags: ['808'],
  })
  const onSave = vi.fn(async () => makeTrack({ id: track.id, name: 'Bassline' }))
  const onClose = vi.fn()
  const onToggleFavorite = vi.fn()
  const result = renderWithProviders(
    <TrackDetailDrawer
      open
      track={track}
      onClose={onClose}
      onSave={onSave}
      onToggleFavorite={onToggleFavorite}
    />,
  )
  return { ...result, track, onSave, onClose, onToggleFavorite }
}

describe('TrackDetailDrawer', () => {
  it('не сохраняет трек с пустым названием и показывает ошибку', async () => {
    const { user, onSave } = setup()

    await user.clear(screen.getByLabelText('Название'))
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(screen.getByText('Введите название трека.')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('показывает ошибку для BPM вне диапазона 20–400', async () => {
    const { user, onSave } = setup()

    await user.clear(screen.getByLabelText('BPM'))
    await user.type(screen.getByLabelText('BPM'), '10')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(screen.getByText('BPM должен быть от 20 до 400.')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('сохраняет нормализованные значения', async () => {
    const { user, track, onSave, onClose } = setup()

    const nameInput = screen.getByLabelText('Название')
    await user.clear(nameInput)
    await user.type(nameInput, 'Bassline ')

    const bpmInput = screen.getByLabelText('BPM')
    await user.clear(bpmInput)
    await user.type(bpmInput, '140')

    await user.clear(screen.getByLabelText('Жанр'))
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave).toHaveBeenCalledWith(
      track.id,
      expect.objectContaining({
        name: 'Bassline',
        bpm: 140,
        genre: null,
        tags: ['808'],
      }),
    )
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('добавляет теги через Enter и не дублирует их', async () => {
    const { user } = setup()

    await user.type(screen.getByLabelText('Теги'), 'dark{Enter}')

    const tagsList = screen.getByRole('list', { name: 'Добавленные теги' })
    expect(within(tagsList).getByText('#dark')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Теги'), 'dark{Enter}')

    expect(within(tagsList).getAllByText('#dark')).toHaveLength(1)
    expect(screen.getByText('Такой тег уже есть.')).toBeInTheDocument()
  })
})
