import { describe, expect, it, vi } from 'vitest'
import { createUpdateStore } from '../updateStore'

describe('updateStore', () => {
  it('начинает с пустого состояния', () => {
    const store = createUpdateStore()
    expect(store.getSnapshot()).toEqual({ needRefresh: false, updating: false })
  })

  it('сообщает подписчикам об изменении и не дёргает их дважды', () => {
    const store = createUpdateStore()
    const listener = vi.fn()
    store.subscribe(listener)

    store.setNeedRefresh(true)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot().needRefresh).toBe(true)

    store.setNeedRefresh(true)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('возвращает один и тот же snapshot, пока ничего не менялось', () => {
    const store = createUpdateStore()
    expect(store.getSnapshot()).toBe(store.getSnapshot())
  })

  it('прекращает уведомления после отписки', () => {
    const store = createUpdateStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    unsubscribe()

    store.setNeedRefresh(true)
    expect(listener).not.toHaveBeenCalled()
  })

  it('dismiss скрывает плашку, не перезагружая страницу', () => {
    const store = createUpdateStore()
    store.setNeedRefresh(true)
    store.dismiss()
    expect(store.getSnapshot()).toEqual({ needRefresh: false, updating: false })
  })

  it('без зарегистрированной реализации applyUpdate ничего не делает', async () => {
    const store = createUpdateStore()
    await store.applyUpdate()
    expect(store.getSnapshot()).toEqual({ needRefresh: false, updating: false })
  })

  it('вызывает applyUpdate и держит флаг обновления до перезагрузки', async () => {
    const store = createUpdateStore()
    let resolveApply: () => void = () => undefined
    const apply = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveApply = resolve
        }),
    )
    store.registerApplyUpdate(apply)
    store.setNeedRefresh(true)

    const pending = store.applyUpdate()
    expect(apply).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot().updating).toBe(true)

    await store.applyUpdate()
    expect(apply).toHaveBeenCalledTimes(1)

    resolveApply()
    await pending
    // updateSW(true) резолвится до перезагрузки — кнопки не разблокируем.
    expect(store.getSnapshot().updating).toBe(true)
  })

  it('снимает флаг обновления, если перезагрузка не произошла', async () => {
    vi.useFakeTimers()
    try {
      const store = createUpdateStore()
      store.registerApplyUpdate(() => Promise.resolve())
      store.setNeedRefresh(true)

      await store.applyUpdate()
      expect(store.getSnapshot().updating).toBe(true)

      await vi.advanceTimersByTimeAsync(10_000)
      expect(store.getSnapshot()).toEqual({ needRefresh: true, updating: false })
    } finally {
      vi.useRealTimers()
    }
  })

  it('сбрасывает флаг обновления при ошибке', async () => {
    const store = createUpdateStore()
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    store.registerApplyUpdate(() => Promise.reject(new Error('сеть')))

    await store.applyUpdate()

    expect(store.getSnapshot().updating).toBe(false)
    expect(consoleSpy).toHaveBeenCalled()
  })
})
