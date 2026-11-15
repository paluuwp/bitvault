import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DropZone } from './DropZone'
import { makeFile } from '@/test/factories'
import { renderWithProviders } from '@/test/render'

function makeDataTransfer(files: File[] = [], types: string[] = []): DataTransfer {
  return {
    types: types.length > 0 ? types : files.length > 0 ? ['Files'] : [],
    items: files.map(() => ({ kind: 'file' })),
    files,
    dropEffect: 'none',
  } as unknown as DataTransfer
}

function renderZone(onFiles = vi.fn()) {
  const result = renderWithProviders(
    <DropZone onFiles={onFiles}>
      <div>Содержимое библиотеки</div>
    </DropZone>,
  )
  const zone = result.container.firstElementChild as HTMLElement
  return { ...result, onFiles, zone }
}

describe('DropZone', () => {
  it('вызывает onFiles при drop с файлами', () => {
    const { onFiles, zone } = renderZone()
    const file = makeFile('beat.wav')

    fireEvent.drop(zone, { dataTransfer: makeDataTransfer([file]) })

    expect(onFiles).toHaveBeenCalledTimes(1)
    expect(onFiles).toHaveBeenCalledWith([file])
  })

  it('не вызывает onFiles при drop без файлов', () => {
    const { onFiles, zone } = renderZone()

    fireEvent.drop(zone, { dataTransfer: makeDataTransfer([], ['Files']) })

    expect(onFiles).not.toHaveBeenCalled()
  })

  it('показывает оверлей только для перетаскивания файлов', () => {
    const { zone } = renderZone()

    fireEvent.dragEnter(zone, { dataTransfer: makeDataTransfer([], ['text/plain']) })
    expect(screen.queryByText('Отпустите файлы, чтобы добавить их')).not.toBeInTheDocument()

    fireEvent.dragEnter(zone, { dataTransfer: makeDataTransfer([makeFile()]) })
    expect(screen.getByText('Отпустите файлы, чтобы добавить их')).toBeInTheDocument()
    expect(screen.getByText(/Файлов: 1/)).toBeInTheDocument()
  })

  it('скрывает оверлей после dragleave', () => {
    const { zone } = renderZone()

    fireEvent.dragEnter(zone, { dataTransfer: makeDataTransfer([makeFile()]) })
    expect(screen.getByText('Отпустите файлы, чтобы добавить их')).toBeInTheDocument()

    fireEvent.dragLeave(zone)
    expect(screen.queryByText('Отпустите файлы, чтобы добавить их')).not.toBeInTheDocument()
  })
})
