import { clsx } from 'clsx'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Spinner } from '@/components/ui'
import { ensureGoogleGis, renderGoogleButton } from '@/lib/auth/google'
import { resolvePublicConfig } from '@/lib/config'

export interface GoogleSignInButtonProps {
  /** Полученный от Google JWT; выше передаётся как есть, без сохранения. */
  onCredential: (credential: string) => void
  /** Блокирует взаимодействие (например, пока идёт другой запрос). */
  disabled?: boolean
  /**
   * Переопределение Client ID (удобно в тестах и нестандартных окружениях).
   * По умолчанию берётся из resolvePublicConfig().
   */
  clientId?: string
  /**
   * Включён ли вход. Передаётся из AuthProvider, чтобы кнопка не решала это
   * по собственному чтению окружения. По умолчанию — resolvePublicConfig().
   */
  authEnabled?: boolean
  /** Причина отключения входа; по умолчанию — resolvePublicConfig(). */
  disabledReason?: string | null
}

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

/** Отслеживает доступность сети, чтобы не грузить GIS в офлайне. */
function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  )

  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return online
}

const noticeClasses =
  'rounded-control border border-hairline bg-bg-subtle px-3 py-2 text-body text-text-muted'

/**
 * Кнопка входа через Google.
 *
 * Скрипт GIS загружается только при монтировании компонента (кнопка живёт в
 * диалоге, который пользователь открывает сам). One Tap не используется,
 * auto_select выключен. Компонент не вызывает API — только отдаёт credential
 * наверх через onCredential.
 */
export function GoogleSignInButton({
  onCredential,
  disabled = false,
  clientId,
  authEnabled,
  disabledReason,
}: GoogleSignInButtonProps) {
  const config = resolvePublicConfig()
  const online = useOnlineStatus()
  const effectiveClientId = clientId ?? config.googleClientId
  const signInEnabled = (authEnabled ?? config.authEnabled) && effectiveClientId.length > 0
  const effectiveDisabledReason =
    disabledReason !== undefined ? disabledReason : config.authDisabledReason

  const containerRef = useRef<HTMLDivElement | null>(null)
  const credentialHandlerRef = useRef(onCredential)

  const [status, setStatus] = useState<LoadStatus>('idle')
  const [attempt, setAttempt] = useState(0)

  // Свежий обработчик без перезапуска загрузки GIS при каждом рендере.
  useEffect(() => {
    credentialHandlerRef.current = onCredential
  }, [onCredential])

  const shouldLoad = signInEnabled && online

  useEffect(() => {
    if (!shouldLoad) return

    const element = containerRef.current
    if (!element) return

    // Флаг отмены: после размонтирования (и в StrictMode) результат загрузки
    // не должен ни рендерить кнопку, ни передавать credential наверх.
    let cancelled = false
    setStatus('loading')

    ensureGoogleGis()
      .then(() => {
        if (cancelled) return
        element.replaceChildren()
        renderGoogleButton(element, {
          clientId: effectiveClientId,
          onCredential: (credential) => {
            if (!cancelled) credentialHandlerRef.current(credential)
          },
        })
      })
      .then(() => {
        if (!cancelled) setStatus('ready')
      })
      .catch(() => {
        if (cancelled) return
        element.replaceChildren()
        setStatus('error')
      })

    return () => {
      cancelled = true
      element.replaceChildren()
    }
  }, [shouldLoad, effectiveClientId, attempt])

  const retry = useCallback(() => {
    setAttempt((value) => value + 1)
  }, [])

  if (!signInEnabled) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col gap-1 rounded-control border border-hairline bg-surface-raised px-3 py-2"
      >
        <p className="text-body font-medium text-text">Вход не настроен в этой сборке</p>
        {effectiveDisabledReason ? (
          <p className="text-caption text-text-muted">{effectiveDisabledReason}</p>
        ) : null}
      </div>
    )
  }

  if (!online) {
    return (
      <div role="status" aria-live="polite" className={noticeClasses}>
        Нет подключения к интернету. Вход временно недоступен, библиотека работает как обычно
      </div>
    )
  }

  // Один live-region на состояние: подпись Spinner. Внешний контейнер
  // помечается aria-busy, пока грузится GIS или идёт другой запрос.
  const isBusy = disabled || status === 'loading' || status === 'idle'

  return (
    <div aria-busy={isBusy || undefined} className="flex flex-col gap-2">
      <div
        ref={containerRef}
        aria-disabled={disabled || undefined}
        inert={disabled || undefined}
        className={clsx(
          'flex min-h-11 items-center',
          // Во время загрузки контейнер невидим, но сохраняет размеры:
          // GIS должен отрисовать кнопку в элементе с реальной шириной.
          status !== 'ready' && 'invisible',
          disabled && 'pointer-events-none opacity-50',
        )}
      />

      {status === 'loading' || status === 'idle' ? (
        <div className="flex items-center gap-2 text-caption text-text-muted">
          <Spinner size="sm" label="Загрузка кнопки Google" />
          <span>Загрузка кнопки входа…</span>
        </div>
      ) : null}

      {status === 'error' ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-control border border-danger/40 bg-danger/10 px-3 py-2"
        >
          <p className="text-body text-text">Не удалось загрузить кнопку Google</p>
          <Button variant="secondary" size="sm" onClick={retry} disabled={disabled}>
            Повторить
          </Button>
        </div>
      ) : null}
    </div>
  )
}
