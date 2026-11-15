import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createUpdateStore } from '@/pwa/updateStore'
import { renderWithProviders } from '@/test/render'
import { UpdateBanner } from './UpdateBanner'

const TITLE = 'Доступна новая версия BitVault'
const DESCRIPTION = 'Обновите страницу — библиотека и файлы останутся на месте.'

/** Promise, который завершается вручную, чтобы проверить состояние «обновляемся». */
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

/** Каждая проверка работает на собственном сторе — глобальный синглтон не трогаем. */
function renderBanner(options: { needRefresh?: boolean } = {}) {
  const store = createUpdateStore()
  if (options.needRefresh ?? true) store.setNeedRefresh(true)
  const result = renderWithProviders(<UpdateBanner store={store} />)
  return { ...result, store }
}

describe('UpdateBanner', () => {
  it('ничего не рендерит, когда обновление не требуется', () => {
    renderBanner({ needRefresh: false })

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByText(TITLE)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Обновить/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Позже' })).not.toBeInTheDocument()
  })

  it('показывает заголовок, описание и обе кнопки, когда обновление доступно', () => {
    renderBanner()

    expect(screen.getByText(TITLE)).toBeInTheDocument()
    expect(screen.getByText(DESCRIPTION)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Обновить/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Позже' })).toBeInTheDocument()
  })

  it('по клику «Обновить» вызывает applyUpdate и держит загрузку до перезагрузки', async () => {
    const store = createUpdateStore()
    store.setNeedRefresh(true)
    const gate = deferred()
    const apply = vi.fn(() => gate.promise)
    store.registerApplyUpdate(apply)

    const { user } = renderWithProviders(<UpdateBanner store={store} />)
    const updateButton = screen.getByRole('button', { name: /Обновить/ })

    await user.click(updateButton)

    expect(apply).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(updateButton).toBeDisabled())
    expect(screen.getByRole('button', { name: 'Позже' })).toBeDisabled()

    gate.resolve()

    // updateSW(true) резолвится до перезагрузки: кнопки остаются заблокированы.
    await waitFor(() => expect(store.getSnapshot().updating).toBe(true))
    expect(updateButton).toBeDisabled()
  })

  it('при ошибке обновления оставляет плашку и разблокирует кнопки', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const store = createUpdateStore()
    store.setNeedRefresh(true)
    store.registerApplyUpdate(() => Promise.reject(new Error('сеть')))

    const { user } = renderWithProviders(<UpdateBanner store={store} />)
    const updateButton = screen.getByRole('button', { name: /Обновить/ })

    await user.click(updateButton)

    await waitFor(() => expect(updateButton).toBeEnabled())
    expect(screen.getByText(TITLE)).toBeInTheDocument()
    expect(store.getSnapshot().needRefresh).toBe(true)
    expect(consoleSpy).toHaveBeenCalled()
  })

  it('блокирует обновление, пока идёт загрузка или импорт', () => {
    const store = createUpdateStore()
    store.setNeedRefresh(true)

    renderWithProviders(<UpdateBanner store={store} blocked />)

    expect(screen.getByRole('button', { name: /Обновить/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Позже' })).toBeEnabled()
    expect(
      screen.getByText(/Дождитесь окончания загрузки или импорта/),
    ).toBeInTheDocument()
  })

  it('во время обновления показывает загрузку и блокирует обе кнопки', async () => {
    const store = createUpdateStore()
    store.setNeedRefresh(true)
    const gate = deferred()
    store.registerApplyUpdate(vi.fn(() => gate.promise))

    const { user } = renderWithProviders(<UpdateBanner store={store} />)
    const updateButton = screen.getByRole('button', { name: /Обновить/ })

    await user.click(updateButton)

    await waitFor(() => expect(updateButton).toBeDisabled())
    expect(updateButton).toHaveAttribute('aria-busy', 'true')
    expect(updateButton).toHaveTextContent('Загрузка')
    expect(screen.getByRole('button', { name: 'Позже' })).toBeDisabled()

    gate.resolve()
    await waitFor(() => expect(store.getSnapshot().updating).toBe(true))
    expect(updateButton).toBeDisabled()
  })

  it('по клику «Позже» скрывает плашку через dismiss', async () => {
    const { user, store } = renderBanner()

    await user.click(screen.getByRole('button', { name: 'Позже' }))

    await waitFor(() => expect(screen.queryByText(TITLE)).not.toBeInTheDocument())
    expect(store.getSnapshot().needRefresh).toBe(false)
  })

  it('объявляет себя вежливым live-регионом', () => {
    renderBanner()

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
  })
})
