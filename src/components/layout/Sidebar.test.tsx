import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Sidebar } from './Sidebar'

type SidebarOverrides = Partial<Omit<ComponentProps<typeof Sidebar>, 'activeSection' | 'onNavigate'>>

function renderSidebar(overrides: SidebarOverrides = {}) {
  const onNavigate = vi.fn()
  const user = userEvent.setup()
  const result = render(
    <Sidebar activeSection="library" onNavigate={onNavigate} {...overrides} />,
  )
  return { ...result, user, onNavigate }
}

describe('Sidebar: блок аккаунта', () => {
  it('в анонимном состоянии показывает «Войти» и открывает диалог', async () => {
    const onOpenAccount = vi.fn()
    const { user } = renderSidebar({
      account: { status: 'anonymous', label: 'Гость', email: null },
      onOpenAccount,
    })

    await user.click(screen.getByRole('button', { name: 'Войти' }))

    expect(onOpenAccount).toHaveBeenCalledTimes(1)
  })

  it('в авторизованном состоянии показывает имя и e-mail и открывает диалог', async () => {
    const onOpenAccount = vi.fn()
    const { user } = renderSidebar({
      account: {
        status: 'authenticated',
        label: 'Иван',
        email: 'user@example.com',
      },
      onOpenAccount,
    })

    expect(screen.getByText('Иван')).toBeInTheDocument()
    expect(screen.getByText('user@example.com')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Иван/ }))

    expect(onOpenAccount).toHaveBeenCalledTimes(1)
  })

  it('без пропсов аккаунта блок не рендерится, а навигация работает', async () => {
    const onOpenSettings = vi.fn()
    const { user, onNavigate } = renderSidebar({ onOpenSettings })

    expect(screen.queryByRole('button', { name: 'Войти' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Библиотека/ }))
    expect(onNavigate).toHaveBeenCalledWith('library')

    await user.click(screen.getByRole('button', { name: 'Настройки' }))
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
  })
})
