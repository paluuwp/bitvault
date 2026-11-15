import { Blob as NodeBlob } from 'node:buffer'
import { DB_NAME } from '../constants'
import { closeDatabase } from '../db'
import { AppError } from '../errors'

// jsdom Blob не переживает structuredClone внутри fake-indexeddb,
// поэтому в тестах подменяем конструктор на Node Blob (в браузере клонирование делает IndexedDB).
globalThis.Blob = NodeBlob as unknown as typeof Blob

export async function resetDatabase(): Promise<void> {
  await closeDatabase()
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => resolve()
  })
}

export function captureAppError(action: () => unknown): AppError {
  try {
    action()
  } catch (error) {
    if (error instanceof AppError) return error
    throw error
  }
  throw new Error('Ожидалась ошибка приложения.')
}

export async function captureAppErrorAsync(action: () => Promise<unknown>): Promise<AppError> {
  try {
    await action()
  } catch (error) {
    if (error instanceof AppError) return error
    throw error
  }
  throw new Error('Ожидалась ошибка приложения.')
}
