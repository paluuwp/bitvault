import {
  openDB,
  type DBSchema,
  type IDBPDatabase,
  type IDBPTransaction,
  type StoreNames,
} from 'idb'
import type { FileKind, StoredFile, Track } from '@/types/models'
import { DB_NAME, DB_VERSION } from './constants'
import { toAppError } from './errors'

export interface BitVaultDB extends DBSchema {
  tracks: {
    key: string
    value: Track
    indexes: {
      'by-name-lower': string
      'by-created-at': string
      'by-bpm': number
      'by-last-played-at': string
    }
  }
  files: {
    key: string
    value: StoredFile
    indexes: {
      'by-kind': FileKind
    }
  }
}

let databasePromise: Promise<IDBPDatabase<BitVaultDB>> | null = null

function initializeDatabase(): Promise<IDBPDatabase<BitVaultDB>> {
  return openDB<BitVaultDB>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains('tracks')) {
        const tracks = database.createObjectStore('tracks', { keyPath: 'id' })
        tracks.createIndex('by-name-lower', 'nameLower')
        tracks.createIndex('by-created-at', 'createdAt')
        tracks.createIndex('by-bpm', 'bpm')
        tracks.createIndex('by-last-played-at', 'lastPlayedAt')
      }
      if (!database.objectStoreNames.contains('files')) {
        const files = database.createObjectStore('files', { keyPath: 'id' })
        files.createIndex('by-kind', 'kind')
      }
    },
  }).catch((error: unknown) => {
    throw toAppError(error)
  })
}

/** Открывает базу один раз и переиспользует соединение. */
export function openDatabase(): Promise<IDBPDatabase<BitVaultDB>> {
  if (!databasePromise) {
    databasePromise = initializeDatabase().catch((error: unknown) => {
      databasePromise = null
      throw error
    })
  }
  return databasePromise
}

/** Закрывает кэшированное соединение (используется при сбросе и в тестах). */
export async function closeDatabase(): Promise<void> {
  const pending = databasePromise
  databasePromise = null
  if (!pending) return
  try {
    const database = await pending
    database.close()
  } catch {
    // Соединение уже недоступно — закрывать нечего.
  }
}

/** Выполняет операцию и приводит любую ошибку к AppError. */
export async function withDatabase<T>(
  operation: (database: IDBPDatabase<BitVaultDB>) => Promise<T>,
): Promise<T> {
  try {
    const database = await openDatabase()
    return await operation(database)
  } catch (error) {
    throw toAppError(error)
  }
}

type WriteTransaction = IDBPTransaction<
  BitVaultDB,
  StoreNames<BitVaultDB>[],
  'readwrite'
>

/**
 * Выполняет набор операций в одной readwrite-транзакции.
 * Транзакция фиксируется после успешного завершения операции и откатывается
 * при любой ошибке, поэтому частичная запись невозможна.
 */
export async function runWriteTransaction<T>(
  database: IDBPDatabase<BitVaultDB>,
  storeNames: StoreNames<BitVaultDB>[],
  operation: (transaction: WriteTransaction) => Promise<T>,
): Promise<T> {
  const transaction = database.transaction(
    storeNames,
    'readwrite',
  ) as WriteTransaction
  try {
    const result = await operation(transaction)
    await transaction.done
    return result
  } catch (error) {
    // При откате `done` отклоняется AbortError — гасим его, иначе оно станет
    // необработанным отклонением, хотя исходная ошибка уже пробрасывается выше.
    transaction.done.catch(() => undefined)
    try {
      transaction.abort()
    } catch {
      // Транзакция уже завершилась или откатилась сама.
    }
    throw error
  }
}
