import { registerSW } from 'virtual:pwa-register'
import { updateStore } from './updateStore'

/** Как часто проверять обновления при возврате на вкладку. */
const UPDATE_CHECK_INTERVAL_MS = 60_000

let initialized = false

/**
 * Регистрирует service worker и связывает его с UI обновления.
 * В тестах и в старой среде без service worker ничего не делает.
 */
export function initPwa(): void {
  if (initialized) return
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  initialized = true

  let registration: ServiceWorkerRegistration | undefined
  let lastCheckedAt = Date.now()

  const checkForUpdate = () => {
    if (!registration) return
    const now = Date.now()
    if (now - lastCheckedAt < UPDATE_CHECK_INTERVAL_MS) return
    lastCheckedAt = now
    registration.update().catch(() => undefined)
  }

  const updateSW = registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registered) {
      registration = registered
      lastCheckedAt = Date.now()
      // Вкладка открыта после деплоя: новый worker уже ждёт активации.
      if (registered?.waiting) updateStore.setNeedRefresh(true)
    },
    onNeedRefresh() {
      updateStore.setNeedRefresh(true)
    },
    onOfflineReady() {
      // Приложение готово к работе офлайн — отдельного уведомления не показываем.
    },
    onRegisterError(error) {
      console.warn('Service worker не зарегистрирован', error)
    },
  })

  updateStore.registerApplyUpdate(async () => {
    await updateSW(true)
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate()
  })
}
