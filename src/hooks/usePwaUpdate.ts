import { useSyncExternalStore } from 'react'
import { updateStore } from '@/pwa/updateStore'
import type { UpdateStore } from '@/pwa/updateStore'

export interface UsePwaUpdateResult {
  needRefresh: boolean
  updating: boolean
  applyUpdate: () => Promise<void>
  dismiss: () => void
}

/**
 * Подписка на состояние обновления PWA через `useSyncExternalStore`.
 * Стор принимается параметром, чтобы в тестах использовать независимый
 * экземпляр `createUpdateStore()` вместо глобального синглтона.
 */
export function usePwaUpdate(store: UpdateStore = updateStore): UsePwaUpdateResult {
  const { needRefresh, updating } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  )

  return {
    needRefresh,
    updating,
    applyUpdate: () => store.applyUpdate(),
    dismiss: () => store.dismiss(),
  }
}
