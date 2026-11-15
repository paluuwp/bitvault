import { vi } from 'vitest'

/**
 * Подмена виртуального модуля `virtual:pwa-register` для тестов: плагин PWA
 * в тестовом режиме отключён, поэтому Vitest резолвит этот импорт сюда
 * (см. `test.alias` в vite.config.ts).
 */
export interface PwaRegisterOptions {
  immediate?: boolean
  onRegisteredSW?: (swUrl: string, registration?: ServiceWorkerRegistration) => void
  onNeedRefresh?: () => void
  onOfflineReady?: () => void
  onRegisterError?: (error: unknown) => void
}

export const registerSWMock = vi.fn<
  (options: PwaRegisterOptions) => (reloadPage?: boolean) => Promise<void>
>()
export const updateSWMock = vi.fn<(reloadPage?: boolean) => Promise<void>>()

export function registerSW(options: PwaRegisterOptions): (reloadPage?: boolean) => Promise<void> {
  registerSWMock(options)
  return updateSWMock
}
