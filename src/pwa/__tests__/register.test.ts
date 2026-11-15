import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function stubServiceWorker(): void {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {},
  })
}

function stubVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  })
}

/**
 * Свежий граф модулей: у register.ts однократная инициализация, а заглушка
 * виртуального модуля PWA хранит вызовы в собственных моках.
 */
async function loadPwa() {
  const stub = await import('../../test/virtualPwaRegister')
  const { updateStore } = await import('../updateStore')
  const { initPwa } = await import('../register')
  stub.updateSWMock.mockResolvedValue(undefined)
  return { stub, updateStore, initPwa }
}

function lastOptions(stub: { registerSWMock: { mock: { calls: unknown[][] } } }) {
  const options = stub.registerSWMock.mock.calls.at(-1)?.[0]
  if (!options) throw new Error('registerSW не вызывался')
  return options as import('../../test/virtualPwaRegister').PwaRegisterOptions
}

beforeEach(() => {
  vi.resetModules()
  Reflect.deleteProperty(navigator, 'serviceWorker')
})

afterEach(() => {
  Reflect.deleteProperty(navigator, 'serviceWorker')
  Reflect.deleteProperty(document, 'visibilityState')
  vi.useRealTimers()
})

describe('initPwa', () => {
  it('ничего не делает, если service worker недоступен', async () => {
    const { stub, initPwa } = await loadPwa()

    initPwa()

    expect(stub.registerSWMock).not.toHaveBeenCalled()
  })

  it('регистрирует service worker ровно один раз', async () => {
    stubServiceWorker()
    const { stub, initPwa } = await loadPwa()

    initPwa()
    initPwa()

    expect(stub.registerSWMock).toHaveBeenCalledTimes(1)
  })

  it('показывает плашку, если новый worker уже ждёт активации', async () => {
    stubServiceWorker()
    const { stub, initPwa, updateStore } = await loadPwa()
    initPwa()

    lastOptions(stub).onRegisteredSW?.('./sw.js', { waiting: {} } as ServiceWorkerRegistration)

    expect(updateStore.getSnapshot().needRefresh).toBe(true)
  })

  it('включает плашку по событию onNeedRefresh', async () => {
    stubServiceWorker()
    const { stub, initPwa, updateStore } = await loadPwa()
    initPwa()

    lastOptions(stub).onNeedRefresh?.()

    expect(updateStore.getSnapshot().needRefresh).toBe(true)
  })

  it('применяет обновление через updateSW(true)', async () => {
    stubServiceWorker()
    const { stub, initPwa, updateStore } = await loadPwa()
    initPwa()

    await updateStore.applyUpdate()

    expect(stub.updateSWMock).toHaveBeenCalledWith(true)
  })

  it('проверяет обновление при возврате на вкладку не чаще раза в минуту', async () => {
    stubServiceWorker()
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const { stub, initPwa } = await loadPwa()
    initPwa()

    const update = vi.fn().mockResolvedValue(undefined)
    lastOptions(stub).onRegisteredSW?.('./sw.js', {
      waiting: null,
      update,
    } as unknown as ServiceWorkerRegistration)
    stubVisibility('visible')

    document.dispatchEvent(new Event('visibilitychange'))
    expect(update).not.toHaveBeenCalled()

    vi.setSystemTime(61_000)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(update).toHaveBeenCalledTimes(1)

    vi.setSystemTime(61_500)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(update).toHaveBeenCalledTimes(1)
  })
})
