import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  GoogleButtonConfiguration,
  GoogleIdConfiguration,
} from '@/types/google-gis'

const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client'
const SCRIPT_SELECTOR = `script[src="${GIS_SCRIPT_SRC}"]`
const CLIENT_ID = '1234567890-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com'

type GoogleModule = typeof import('@/lib/auth/google')

// Модуль кэширует промис загрузки, поэтому каждый тест получает свежий
// экземпляр через vi.resetModules() + динамический импорт.
let gis: GoogleModule

function removeGisScripts(): void {
  document
    .querySelectorAll<HTMLScriptElement>(SCRIPT_SELECTOR)
    .forEach((script) => script.remove())
}

/** Устанавливает window.google.accounts.id с типизированными моками. */
function installGoogleId() {
  const initialize = vi.fn<(configuration: GoogleIdConfiguration) => void>()
  const renderButton =
    vi.fn<(parent: HTMLElement, options: GoogleButtonConfiguration) => void>()
  const disableAutoSelect = vi.fn<() => void>()
  const cancel = vi.fn<() => void>()

  window.google = {
    accounts: { id: { initialize, renderButton, disableAutoSelect, cancel } },
  }

  return { initialize, renderButton, disableAutoSelect, cancel }
}

function getScript(): HTMLScriptElement | null {
  return document.querySelector<HTMLScriptElement>(SCRIPT_SELECTOR)
}

beforeEach(async () => {
  vi.resetModules()
  vi.useRealTimers()
  removeGisScripts()
  delete window.google
  gis = await import('@/lib/auth/google')
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  removeGisScripts()
  delete window.google
})

describe('ensureGoogleGis', () => {
  it('вставляет один <script> и возвращает тот же промис при повторных вызовах', async () => {
    const first = gis.ensureGoogleGis()
    const second = gis.ensureGoogleGis()

    expect(second).toBe(first)
    expect(document.querySelectorAll(SCRIPT_SELECTOR)).toHaveLength(1)

    const script = getScript()
    expect(script).not.toBeNull()
    script?.dispatchEvent(new Event('load'))

    await expect(first).resolves.toBeUndefined()
  })

  it('резолвится сразу, если GIS уже загружен', async () => {
    installGoogleId()

    await expect(gis.ensureGoogleGis()).resolves.toBeUndefined()
    expect(getScript()).toBeNull()
  })

  it('переиспользует тег, который уже есть в DOM, и не создаёт второй', async () => {
    const existing = document.createElement('script')
    existing.src = GIS_SCRIPT_SRC
    document.head.appendChild(existing)

    const promise = gis.ensureGoogleGis()
    expect(document.querySelectorAll(SCRIPT_SELECTOR)).toHaveLength(1)

    existing.dispatchEvent(new Event('load'))
    await expect(promise).resolves.toBeUndefined()
  })

  it('по таймауту отклоняется, сбрасывает промис и позволяет повторить загрузку', async () => {
    vi.useFakeTimers()

    const first = gis.ensureGoogleGis()
    const rejection = expect(first).rejects.toThrow(/не загрузился/)

    await vi.advanceTimersByTimeAsync(gis.GIS_LOAD_TIMEOUT_MS)
    await rejection

    // Неудачный тег убран, поэтому повтор создаёт новый <script>.
    expect(getScript()).toBeNull()

    const retry = gis.ensureGoogleGis()
    expect(retry).not.toBe(first)
    expect(document.querySelectorAll(SCRIPT_SELECTOR)).toHaveLength(1)

    const retryScript = getScript()
    const retryRejection = expect(retry).rejects.toThrow()
    retryScript?.dispatchEvent(new Event('error'))
    await retryRejection
  })

  it('отклоняется при ошибке загрузки скрипта и очищает тег', async () => {
    const promise = gis.ensureGoogleGis()
    const rejection = expect(promise).rejects.toThrow(
      'Не удалось загрузить Google Identity Services',
    )

    getScript()?.dispatchEvent(new Event('error'))
    await rejection

    expect(getScript()).toBeNull()
  })
})

describe('initializeGoogleSignIn', () => {
  it('выключает auto_select и пропускает пустой и чужой credential', () => {
    const mocks = installGoogleId()
    const onCredential = vi.fn()

    gis.initializeGoogleSignIn({ clientId: CLIENT_ID, onCredential })

    expect(mocks.initialize).toHaveBeenCalledTimes(1)
    const configuration = mocks.initialize.mock.calls[0]?.[0]
    expect(configuration).toBeDefined()
    if (!configuration) throw new Error('initialize не был вызван')

    expect(configuration.client_id).toBe(CLIENT_ID)
    expect(configuration.auto_select).toBe(false)

    configuration.callback({ credential: '' })
    configuration.callback({})
    configuration.callback({
      credential: 'чужой-jwt',
      clientId: 'other-client-id.apps.googleusercontent.com',
    })
    expect(onCredential).not.toHaveBeenCalled()

    configuration.callback({ credential: 'свой-jwt', clientId: CLIENT_ID })
    expect(onCredential).toHaveBeenCalledWith('свой-jwt')

    configuration.callback({ credential: 'свой-jwt-2' })
    expect(onCredential).toHaveBeenLastCalledWith('свой-jwt-2')
  })
})

describe('renderGoogleButton', () => {
  it('рисует кнопку с русской локалью и оформлением filled_black', () => {
    const mocks = installGoogleId()
    const parent = document.createElement('div')
    const onCredential = vi.fn()

    gis.renderGoogleButton(parent, { clientId: CLIENT_ID, onCredential })

    expect(mocks.initialize).toHaveBeenCalledTimes(1)
    expect(mocks.renderButton).toHaveBeenCalledWith(parent, {
      theme: 'filled_black',
      size: 'large',
      text: 'signin_with',
      shape: 'rectangular',
      locale: 'ru',
    })
  })
})

describe('disableAutoSelect', () => {
  it('безопасен, когда GIS не загружен', () => {
    expect(() => gis.disableAutoSelect()).not.toThrow()
  })

  it('вызывает GIS, когда он доступен', () => {
    const mocks = installGoogleId()

    gis.disableAutoSelect()

    expect(mocks.disableAutoSelect).toHaveBeenCalledTimes(1)
  })
})
