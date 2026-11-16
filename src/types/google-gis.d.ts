/*
 * Минимальные объявления Google Identity Services (GIS).
 *
 * Пакет `@types/google.accounts` в проекте не подключён: нам нужна только
 * небольшая часть API, которую использует вход через Google. Скрипт GIS
 * подключается лениво (см. src/lib/auth/google.ts), поэтому window.google
 * объявлен необязательным.
 */

/** Ответ GIS, который передаётся в callback после выбора аккаунта. */
export interface GoogleCredentialResponse {
  /** JWT с данными пользователя; пустой/отсутствующий означает отмену входа. */
  credential?: string
  /** Client ID, для которого выпущен credential. */
  clientId?: string
  /** Способ выбора аккаунта (например, «btn»); для логики не используется. */
  select_by?: string
}

/** Параметры google.accounts.id.initialize(). */
export interface GoogleIdConfiguration {
  client_id: string
  callback: (response: GoogleCredentialResponse) => void
  /** One Tap отключён: автоматический вход не выполняется. */
  auto_select?: boolean
  cancel_on_tap_outside?: boolean
  context?: 'signin' | 'signup' | 'use'
  itp_support?: boolean
  locale?: string
  nonce?: string
  ux_mode?: 'popup' | 'redirect'
  use_fedcm_for_prompt?: boolean
}

/** Параметры google.accounts.id.renderButton(). */
export interface GoogleButtonConfiguration {
  type?: 'standard' | 'icon'
  theme?: 'outline' | 'filled_blue' | 'filled_black'
  size?: 'large' | 'medium' | 'small'
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'
  shape?: 'rectangular' | 'pill' | 'circle' | 'square'
  logo_alignment?: 'left' | 'center'
  width?: number
  locale?: string
  state?: string
  click_listener?: () => void
}

/** Подмножество google.accounts.id, используемое приложением. */
export interface GoogleAccountsId {
  initialize(configuration: GoogleIdConfiguration): void
  renderButton(parent: HTMLElement, options: GoogleButtonConfiguration): void
  disableAutoSelect(): void
  cancel(): void
}

export interface GoogleAccounts {
  id?: GoogleAccountsId
}

declare global {
  interface Window {
    /** Появляется только после загрузки скрипта GIS. */
    google?: {
      accounts?: GoogleAccounts
    }
  }
}
