import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ImportDialog } from './ImportDialog'
import { makeFile, makeImportResult } from '@/test/factories'
import { renderWithProviders } from '@/test/render'

function setup(options: { uploading?: boolean } = {}) {
  const onImport = vi.fn(async () => makeImportResult())
  const onClose = vi.fn()
  const onExportFirst = vi.fn()
  const result = renderWithProviders(
    <ImportDialog
      open
      file={makeFile('backup.zip', 'application/zip', ['zip'])}
      busy={false}
      uploading={options.uploading ?? false}
      exporting={false}
      progress={null}
      errorMessage={null}
      onClose={onClose}
      onImport={onImport}
      onExportFirst={onExportFirst}
    />,
  )
  return { ...result, onImport, onClose, onExportFirst }
}

describe('ImportDialog', () => {
  it('в режиме merge кнопка активна сразу и импорт идёт с mode=merge', async () => {
    const { user, onImport } = setup()

    const importButton = screen.getByRole('button', { name: 'Импортировать' })
    expect(importButton).toBeEnabled()

    await user.click(importButton)

    await waitFor(() => expect(onImport).toHaveBeenCalledWith('merge'))
    expect(await screen.findByText('Импорт завершён')).toBeInTheDocument()
  })

  it('в режиме replace требует подтверждение «ЗАМЕНИТЬ»', async () => {
    const { user, onImport } = setup()

    await user.click(screen.getByRole('radio', { name: /Заменить/ }))

    const replaceButton = screen.getByRole('button', { name: 'Заменить библиотеку' })
    expect(replaceButton).toBeDisabled()

    const confirmInput = screen.getByLabelText('Введите ЗАМЕНИТЬ, чтобы подтвердить')
    await user.type(confirmInput, 'НЕТ')
    expect(replaceButton).toBeDisabled()

    await user.clear(confirmInput)
    await user.type(confirmInput, 'ЗАМЕНИТЬ')
    expect(replaceButton).toBeEnabled()

    await user.click(replaceButton)

    await waitFor(() => expect(onImport).toHaveBeenCalledWith('replace'))
    expect(await screen.findByText('Импорт завершён')).toBeInTheDocument()
  })

  it('блокирует импорт, пока идёт загрузка файлов', async () => {
    setup({ uploading: true })

    expect(screen.getByRole('button', { name: 'Импортировать' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('дождитесь завершения загрузки')
  })
})
