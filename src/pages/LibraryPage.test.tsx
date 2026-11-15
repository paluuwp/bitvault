import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LibraryPage } from './LibraryPage'
import { makeTrack } from '@/test/factories'
import { renderWithProviders } from '@/test/render'

describe('LibraryPage', () => {
  it('показывает пустое состояние и кнопку добавления', async () => {
    const onAddTrack = vi.fn()
    const { user } = renderWithProviders(
      <LibraryPage title="Библиотека" tracks={[]} view="grid" onAddTrack={onAddTrack} />,
    )

    expect(screen.getByText('Библиотека пока пуста')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Добавить биты' }))
    expect(onAddTrack).toHaveBeenCalledTimes(1)
  })

  it('при активных фильтрах показывает «Ничего не найдено» и сбрасывает фильтры', async () => {
    const onResetFilters = vi.fn()
    const { user } = renderWithProviders(
      <LibraryPage
        title="Библиотека"
        tracks={[]}
        view="grid"
        hasActiveFilters
        onResetFilters={onResetFilters}
      />,
    )

    expect(screen.getByText('Ничего не найдено')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Сбросить фильтры' }))
    expect(onResetFilters).toHaveBeenCalledTimes(1)
  })

  it('во время первичной загрузки показывает скелетон', () => {
    const { container } = renderWithProviders(
      <LibraryPage title="Библиотека" tracks={[]} view="grid" loading />,
    )

    expect(screen.getByText('Загрузка библиотеки')).toBeInTheDocument()
    expect(container.querySelector('.track-grid')).not.toBeNull()
  })

  it('показывает ошибку с кнопкой «Повторить»', async () => {
    const onRetry = vi.fn()
    const { user } = renderWithProviders(
      <LibraryPage
        title="Библиотека"
        tracks={[]}
        view="grid"
        errorMessage="Хранилище недоступно"
        onRetry={onRetry}
      />,
    )

    expect(screen.getByText('Не удалось загрузить библиотеку')).toBeInTheDocument()
    expect(screen.getByText('Хранилище недоступно')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('переключает сетку и список по view', () => {
    const tracks = [
      makeTrack({ id: 'track-a', name: 'Первый' }),
      makeTrack({ id: 'track-b', name: 'Второй' }),
    ]
    const { rerender } = renderWithProviders(
      <LibraryPage title="Библиотека" tracks={tracks} view="grid" />,
    )

    expect(screen.getAllByRole('article')).toHaveLength(2)

    rerender(<LibraryPage title="Библиотека" tracks={tracks} view="list" />)

    expect(screen.queryAllByRole('article')).toHaveLength(0)
    expect(screen.getByRole('list', { name: 'Библиотека' })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })
})
