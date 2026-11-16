import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ensureGoogleGis, renderGoogleButton } from '@/lib/auth/google'
import {
  GoogleSignInButton,
  type GoogleSignInButtonProps,
} from './GoogleSignInButton'

// Загрузчик GIS изолирован: компонент проверяется без реальной сети и скриптов.
vi.mock('@/lib/auth/google', () => ({
  ensureGoogleGis: vi.fn(),
  renderGoogleButton: vi.fn(),
  disableAutoSelect: vi.fn(),
}))

const ensureGoogleGisMock = vi.mocked(ensureGoogleGis)
const renderGoogleButtonMock = vi.mocked(renderGoogleButton)

const GIS_SCRIPT_SELECTOR = 'script[src="https://accounts.google.com/gsi/client"]'

type Overrides = Partial<Omit<GoogleSignInButtonProps, 'onCredential'>>

function renderButton(overrides: Overrides = {}) {
  const onCredential = vi.fn()
  const user = userEvent.setup()
  const result = render(
    <GoogleSignInButton {...overrides} onCredential={onCredential} />,
  )
  return { ...result, user, onCredential }
}

beforeEach(() => {
  ensureGoogleGisMock.mockReset()
  renderGoogleButtonMock.mockReset()
  ensureGoogleGisMock.mockResolvedValue(undefined)
  document.querySelectorAll(GIS_SCRIPT_SELECTOR).forEach((script) => script.remove())
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  document.querySelectorAll(GIS_SCRIPT_SELECTOR).forEach((script) => script.remove())
})

describe('GoogleSignInButton', () => {
  it('при выключенном входе показывает причину и не грузит GIS', () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'not-a-client-id')

    renderButton()

    expect(screen.getByText('Вход не настроен в этой сборке')).toBeInTheDocument()
    expect(screen.getByText(/VITE_GOOGLE_CLIENT_ID/)).toBeInTheDocument()
    expect(ensureGoogleGisMock).not.toHaveBeenCalled()
    expect(document.querySelector(GIS_SCRIPT_SELECTOR)).toBeNull()
  })

  it('без интернета показывает сообщение и не грузит GIS', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)

    renderButton()

    expect(
      screen.getByText(
        'Нет подключения к интернету. Вход временно недоступен, библиотека работает как обычно',
      ),
    ).toBeInTheDocument()
    expect(ensureGoogleGisMock).not.toHaveBeenCalled()
    expect(document.querySelector(GIS_SCRIPT_SELECTOR)).toBeNull()
  })

  it('после загрузки GIS рисует кнопку и отдаёт credential наверх', async () => {
    const { onCredential } = renderButton()

    await waitFor(() => expect(renderGoogleButtonMock).toHaveBeenCalledTimes(1))

    const calls = renderGoogleButtonMock.mock.calls
    expect(calls).toHaveLength(1)
    const [element, options] = calls[0]
    expect(element).toBeInstanceOf(HTMLElement)
    expect(options.clientId).toMatch(/\.apps\.googleusercontent\.com$/)

    options.onCredential('google-jwt')
    expect(onCredential).toHaveBeenCalledWith('google-jwt')

    await waitFor(() =>
      expect(screen.queryByText('Загрузка кнопки входа…')).not.toBeInTheDocument(),
    )
  })

  it('при ошибке загрузки показывает сообщение и кнопку «Повторить»', async () => {
    ensureGoogleGisMock.mockRejectedValueOnce(new Error('network'))

    renderButton()

    expect(
      await screen.findByText('Не удалось загрузить кнопку Google'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
    expect(renderGoogleButtonMock).not.toHaveBeenCalled()
  })

  it('после размонтирования не передаёт credential наверх', async () => {
    const { onCredential, unmount } = renderButton()

    await waitFor(() => expect(renderGoogleButtonMock).toHaveBeenCalledTimes(1))

    const calls = renderGoogleButtonMock.mock.calls
    expect(calls).toHaveLength(1)
    const [element, options] = calls[0]

    unmount()

    options.onCredential('google-jwt')
    expect(onCredential).not.toHaveBeenCalled()
    expect(element.isConnected).toBe(false)
  })

  it('по кнопке «Повторить» повторяет загрузку и снова рисует кнопку', async () => {
    ensureGoogleGisMock
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(undefined)

    const { user } = renderButton()

    const retryButton = await screen.findByRole('button', { name: 'Повторить' })
    expect(ensureGoogleGisMock).toHaveBeenCalledTimes(1)

    await user.click(retryButton)

    await waitFor(() => expect(renderGoogleButtonMock).toHaveBeenCalledTimes(1))
    expect(ensureGoogleGisMock).toHaveBeenCalledTimes(2)
    expect(
      screen.queryByText('Не удалось загрузить кнопку Google'),
    ).not.toBeInTheDocument()
  })

  it('в состоянии загрузки контейнер помечен aria-busy, а live-region один', () => {
    ensureGoogleGisMock.mockReturnValue(new Promise<void>(() => {}))

    const { container } = renderButton()

    expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true')
    // Спиннер — единственный live-region; внешний текст не дублирует его.
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1)
  })

  it('в заблокированном состоянии контейнер aria-busy и inert', async () => {
    const { container } = renderButton({ disabled: true })

    await waitFor(() => expect(renderGoogleButtonMock).toHaveBeenCalled())

    expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true')
    expect(container.querySelector('[inert]')).not.toBeNull()
  })
})
