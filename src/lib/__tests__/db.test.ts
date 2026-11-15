import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, openDatabase } from '../db'
import { resetDatabase } from './helpers'

beforeEach(async () => {
  await resetDatabase()
})

afterEach(async () => {
  await closeDatabase()
})

describe('openDatabase', () => {
  it('создаёт хранилища и индексы', async () => {
    const database = await openDatabase()
    expect(database.name).toBe('bitvault')
    expect(database.version).toBe(1)
    expect(Array.from(database.objectStoreNames)).toEqual(
      expect.arrayContaining(['tracks', 'files']),
    )

    const transaction = database.transaction(['tracks', 'files'])
    expect(Array.from(transaction.objectStore('tracks').indexNames)).toEqual(
      expect.arrayContaining(['by-name-lower', 'by-created-at', 'by-bpm', 'by-last-played-at']),
    )
    expect(Array.from(transaction.objectStore('files').indexNames)).toContain('by-kind')
  })

  it('переиспользует соединение', async () => {
    const first = await openDatabase()
    const second = await openDatabase()
    expect(second).toBe(first)
  })

  it('открывает базу заново после закрытия', async () => {
    const first = await openDatabase()
    await closeDatabase()
    const second = await openDatabase()
    expect(second).not.toBe(first)
    expect(second.objectStoreNames.contains('tracks')).toBe(true)
  })
})
