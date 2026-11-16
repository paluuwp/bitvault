import { LogOut, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Badge, Button, ConfirmDialog, Modal } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { describeRemoteApiError } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { GoogleSignInButton } from './GoogleSignInButton'

export interface AccountDialogProps {
  open: boolean
  onClose: () => void
}

function roleLabel(role: string): string {
  switch (role) {
    case 'owner':
      return 'владелец'
    case 'editor':
      return 'редактор'
    case 'viewer':
      return 'читатель'
    default:
      return role
  }
}

/** Инициалы для локального аватара: имя, а при его отсутствии — e-mail. */
function accountInitials(name: string | null, email: string): string {
  const source = name?.trim() || email.trim()
  if (!source) return '?'

  const words = source.split(/\s+/).filter((word) => word.length > 0)
  if (words.length >= 2) {
    // Array.from не разрывает суррогатные пары: emoji остаётся целым.
    const first = Array.from(words[0])[0] ?? ''
    const second = Array.from(words[1])[0] ?? ''
    return `${first}${second}`.toUpperCase()
  }

  const first = Array.from(source)[0]
  return first ? first.toUpperCase() : '?'
}

const ANONYMOUS_DESCRIPTION =
  'Вход нужен для будущей синхронизации. Библиотека хранится в этом браузере и работает без входа.'

/**
 * Диалог аккаунта: вход через Google и сведения о текущей сессии.
 *
 * При открытии в авторизованном состоянии один раз запрашивает /auth/me —
 * это действие пользователя, а не фоновая синхронизация. В анонимном
 * состоянии сетевых вызовов, кроме загрузки GIS внутри кнопки Google, нет.
 */
export function AccountDialog({ open, onClose }: AccountDialogProps) {
  const {
    status,
    session,
    busy,
    error,
    notice,
    config,
    loginWithCredential,
    refreshAccount,
    logout,
    logoutEverywhere,
    clearError,
  } = useAuth()

  const librariesId = useId()
  const [confirmLogoutAllOpen, setConfirmLogoutAllOpen] = useState(false)
  const [failedPicture, setFailedPicture] = useState<string | null>(null)
  const refreshHandledRef = useRef(false)

  // Подтверждение «Выйти везде» не должно всплывать само после повторного
  // входа: при уходе из авторизованного состояния сбрасываем его.
  useEffect(() => {
    if (status !== 'authenticated') setConfirmLogoutAllOpen(false)
  }, [status])

  // Обновление при открытии: строго один раз, даже в StrictMode.
  useEffect(() => {
    if (!open) {
      refreshHandledRef.current = false
      return
    }
    if (refreshHandledRef.current) return

    refreshHandledRef.current = true
    clearError()
    if (status === 'authenticated') void refreshAccount()
  }, [clearError, open, refreshAccount, status])

  const handleClose = useCallback(() => {
    setConfirmLogoutAllOpen(false)
    onClose()
  }, [onClose])

  const handleCredential = useCallback(
    (credential: string) => {
      if (busy !== null) return
      clearError()
      void loginWithCredential(credential)
    },
    [busy, clearError, loginWithCredential],
  )

  const handleRefresh = () => {
    if (busy !== null) return
    clearError()
    void refreshAccount()
  }

  const handleLogout = () => {
    if (busy !== null) return
    void logout()
  }

  const handleLogoutEverywhere = () => {
    setConfirmLogoutAllOpen(false)
    if (busy !== null) return
    void logoutEverywhere()
  }

  const picture = session?.user.picture ?? null
  const showPicture = picture !== null && failedPicture !== picture
  const errorMessage = error
    ? describeRemoteApiError(error, status === 'authenticated' ? 'refresh' : 'login')
    : null

  return (
    <>
      <Modal
        open={open}
        onClose={handleClose}
        title="Аккаунт"
        description={
          status === 'anonymous'
            ? ANONYMOUS_DESCRIPTION
            : 'Профиль, сессия и библиотеки аккаунта'
        }
        size="md"
        closeOnBackdrop={busy === null}
      >
        {open ? (
          <div className="flex flex-col gap-4">
            {notice ? (
              <p
                role="status"
                className="rounded-control border border-info/30 bg-info/10 px-3 py-2 text-body text-text"
              >
                {notice}
              </p>
            ) : null}

            {errorMessage ? (
              <p
                role="alert"
                className="rounded-control border border-danger/40 bg-danger/10 px-3 py-2 text-body text-text"
              >
                {errorMessage}
              </p>
            ) : null}

            {status === 'anonymous' || !session ? (
              <div className="flex flex-col gap-4">
                <GoogleSignInButton
                  onCredential={handleCredential}
                  disabled={busy !== null}
                  clientId={config.googleClientId}
                  authEnabled={config.authEnabled}
                  disabledReason={config.authDisabledReason}
                />
                <p className="text-caption text-text-muted">
                  Токен хранится в этом браузере, e-mail проверяется на сервере.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  {showPicture && picture !== null ? (
                    <img
                      src={picture}
                      alt=""
                      aria-hidden="true"
                      referrerPolicy="no-referrer"
                      onError={() => setFailedPicture(picture)}
                      className="h-12 w-12 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-raised text-label font-semibold text-text"
                    >
                      {accountInitials(session.user.name, session.user.email)}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-h2 text-text">
                      {session.user.name ?? session.user.email}
                    </p>
                    {session.user.name ? (
                      <p className="truncate text-body text-text-muted">
                        {session.user.email}
                      </p>
                    ) : null}
                    <p className="text-caption text-text-muted">
                      Сессия действует до {formatDate(session.expiresAt)}
                    </p>
                  </div>
                </div>

                <section
                  aria-labelledby={librariesId}
                  className="fl-inset rounded-control p-3"
                >
                  <h3
                    id={librariesId}
                    className="text-caption tracking-[0.08em] text-text-muted uppercase"
                  >
                    Библиотеки
                  </h3>
                  {session.libraries.length === 0 ? (
                    <p className="mt-2 text-body text-text-muted">
                      Библиотек пока нет.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-1">
                      {session.libraries.map((library) => (
                        <li
                          key={library.id}
                          className="flex items-center justify-between gap-2"
                        >
                          <span className="min-w-0 truncate text-body text-text">
                            {library.name}
                          </span>
                          <Badge>{roleLabel(library.role)}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <p className="text-caption text-text-muted">
                  Синхронизация ещё не включена: биты хранятся только в этом браузере.
                </p>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    onClick={handleRefresh}
                    loading={busy === 'refresh'}
                    disabled={busy !== null}
                    leftIcon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
                  >
                    Обновить данные
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={handleLogout}
                    loading={busy === 'logout'}
                    disabled={busy !== null}
                    leftIcon={<LogOut className="h-4 w-4" aria-hidden="true" />}
                  >
                    Выйти
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setConfirmLogoutAllOpen(true)}
                    disabled={busy !== null}
                  >
                    Выйти на всех устройствах
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      {open && status === 'authenticated' ? (
        <ConfirmDialog
          open={confirmLogoutAllOpen}
          title="Выйти на всех устройствах?"
          description="Сессия завершится на всех устройствах. На этом устройстве тоже потребуется войти снова."
          confirmLabel="Выйти везде"
          cancelLabel="Отмена"
          destructive
          onConfirm={handleLogoutEverywhere}
          onCancel={() => setConfirmLogoutAllOpen(false)}
        />
      ) : null}
    </>
  )
}
