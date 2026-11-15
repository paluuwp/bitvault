import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import 'fake-indexeddb/auto'

// Vitest запускается без `globals: true`, поэтому автоочистка Testing Library
// не регистрируется сама — размонтируем деревья между тестами явно.
afterEach(() => {
  cleanup()
})
