export interface PwaUpdateSnapshot {
  /** Новый service worker установлен и ждёт активации. */
  needRefresh: boolean
  /** Пользователь нажал «Обновить», страница перезагрузится. */
  updating: boolean
}

export type ApplyUpdate = () => Promise<void>

export interface UpdateStore {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => PwaUpdateSnapshot
  setNeedRefresh: (value: boolean) => void
  dismiss: () => void
  registerApplyUpdate: (apply: ApplyUpdate) => void
  applyUpdate: () => Promise<void>
}

/**
 * Сколько держать состояние «обновляемся», если перезагрузка так и не
 * случилась (например, её отменил браузер или пользователь).
 */
const RELOAD_FALLBACK_MS = 10_000

/**
 * Состояние обновления PWA без зависимостей от React и virtual-модуля
 * `virtual:pwa-register` — чтобы его можно было проверять в jsdom.
 */
export function createUpdateStore(): UpdateStore {
  let snapshot: PwaUpdateSnapshot = { needRefresh: false, updating: false }
  const listeners = new Set<() => void>()
  let apply: ApplyUpdate | null = null
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null

  const publish = (next: PwaUpdateSnapshot) => {
    snapshot = next
    for (const listener of listeners) listener()
  }

  const setNeedRefresh = (value: boolean) => {
    if (snapshot.needRefresh === value) return
    publish({ ...snapshot, needRefresh: value })
  }

  const clearFallback = () => {
    if (fallbackTimer === null) return
    clearTimeout(fallbackTimer)
    fallbackTimer = null
  }

  const finishUpdating = () => {
    clearFallback()
    if (snapshot.updating) publish({ ...snapshot, updating: false })
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot() {
      return snapshot
    },
    setNeedRefresh,
    dismiss() {
      setNeedRefresh(false)
    },
    registerApplyUpdate(fn) {
      apply = fn
    },
    async applyUpdate() {
      if (snapshot.updating || !apply) return
      clearFallback()
      publish({ ...snapshot, updating: true })
      try {
        // В prompt-режиме updateSW(true) только отправляет SKIP_WAITING и
        // резолвится до перезагрузки, поэтому флаг снимаем не сразу: страница
        // перезагрузится сама, а таймер — страховка на случай отмены.
        await apply()
        fallbackTimer = setTimeout(finishUpdating, RELOAD_FALLBACK_MS)
      } catch (error) {
        console.error('Не удалось применить обновление', error)
        finishUpdating()
      }
    },
  }
}

/** Единственный экземпляр на приложение. */
export const updateStore = createUpdateStore()
