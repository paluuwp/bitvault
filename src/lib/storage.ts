import type { StorageInfo } from '@/types/models'

function getStorageManager(): StorageManager | null {
  if (typeof navigator === 'undefined' || typeof navigator.storage === 'undefined') return null
  return navigator.storage
}

/** Оценка занятого места и статуса постоянного хранилища с безопасным откатом. */
export async function getStorageInfo(): Promise<StorageInfo> {
  const storage = getStorageManager()
  if (!storage) {
    return { supported: false, usage: null, quota: null, persisted: false }
  }

  let usage: number | null = null
  let quota: number | null = null
  let persisted = false

  try {
    if (typeof storage.estimate === 'function') {
      const estimate = await storage.estimate()
      usage = typeof estimate.usage === 'number' ? estimate.usage : null
      quota = typeof estimate.quota === 'number' ? estimate.quota : null
    }
  } catch {
    usage = null
    quota = null
  }

  try {
    if (typeof storage.persisted === 'function') {
      persisted = await storage.persisted()
    }
  } catch {
    persisted = false
  }

  return { supported: true, usage, quota, persisted }
}

export async function requestPersistence(): Promise<boolean> {
  const storage = getStorageManager()
  if (!storage || typeof storage.persist !== 'function') return false
  try {
    return await storage.persist()
  } catch {
    return false
  }
}
