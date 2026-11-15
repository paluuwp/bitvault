/* eslint-disable react-refresh/only-export-components -- тестовый хелпер, не часть HMR-графа приложения */
import { render } from '@testing-library/react'
import type { RenderOptions, RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { UserEvent } from '@testing-library/user-event'
import type { ReactElement, ReactNode } from 'react'
import { ToastProvider } from '@/context/ToastContext'

function Providers({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>
}

export type RenderWithProvidersResult = RenderResult & { user: UserEvent }

/** Единая настройка user-event для тестов, которым не нужен обёрточный рендер. */
export function setupUser(): UserEvent {
  return userEvent.setup()
}

/**
 * Рендерит компонент внутри ToastProvider (его требуют уведомления) и сразу
 * создаёт пользователя user-event. PlayerProvider намеренно не подключается:
 * он создаёт `<audio>` и не нужен большинству компонентных тестов.
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
): RenderWithProvidersResult {
  const user = userEvent.setup()
  return { user, ...render(ui, { wrapper: Providers, ...options }) }
}
