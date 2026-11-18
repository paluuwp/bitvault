import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AppearancePanel } from './AppearancePanel'
import { ACCENT_STORAGE_KEY } from '@/lib/theme'
import { renderWithProviders } from '@/test/render'

afterEach(() => {
  window.localStorage.clear()
  document.documentElement.removeAttribute('style')
})

describe('AppearancePanel', () => {
  it('по умолчанию выбран оранжевый, выбор цвета применяет и сохраняет акцент', async () => {
    const { user } = renderWithProviders(<AppearancePanel />)

    expect(screen.getByRole('radiogroup', { name: 'Акцентный цвет' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Оранжевый' })).toHaveAttribute('aria-checked', 'true')

    await user.click(screen.getByRole('radio', { name: 'Синий' }))

    expect(screen.getByRole('radio', { name: 'Синий' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Оранжевый' })).toHaveAttribute('aria-checked', 'false')
    expect(document.documentElement.style.getPropertyValue('--color-accent')).toBe('#4c8dff')
    expect(window.localStorage.getItem(ACCENT_STORAGE_KEY)).toBe('#4c8dff')
  })

  it('«Сбросить» возвращает оранжевый', async () => {
    const { user } = renderWithProviders(<AppearancePanel />)
    await user.click(screen.getByRole('radio', { name: 'Зелёный' }))
    await user.click(screen.getByRole('button', { name: 'Сбросить' }))

    expect(screen.getByRole('radio', { name: 'Оранжевый' })).toHaveAttribute('aria-checked', 'true')
    expect(document.documentElement.style.getPropertyValue('--color-accent')).toBe('#f7931e')
  })
})
