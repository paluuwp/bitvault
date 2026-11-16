import type {
  GoogleAccountsId,
  GoogleButtonConfiguration,
  GoogleCredentialResponse,
} from '@/types/google-gis'

/** Официальный источник библиотеки Google Identity Services. */
const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client'

const SCRIPT_SELECTOR = `script[src="${GIS_SCRIPT_SRC}"]`

/** Сколько ждать загрузки GIS, прежде чем показать ошибку. */
export const GIS_LOAD_TIMEOUT_MS = 8_000

const DEFAULT_LOCALE = 'ru'

/**
 * Общий промис загрузки: сколько бы раз ни вызывали ensureGoogleGis(),
 * тег <script> вставляется один раз. При ошибке промис сбрасывается, чтобы
 * пользователь мог повторить попытку.
 */
let loadPromise: Promise<void> | null = null

/** Загруженный GIS API или null, если скрипт ещё не готов. */
function getGoogleId(): GoogleAccountsId | null {
  return window.google?.accounts?.id ?? null
}

/** Уже вставленный тег GIS (например, после неудачной попытки другого кода). */
function findScript(): HTMLScriptElement | null {
  return document.querySelector<HTMLScriptElement>(SCRIPT_SELECTOR)
}

function loadGisScript(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const existing = findScript()
    const script = existing ?? document.createElement('script')
    const created = existing === null

    let settled = false
    let timer: number | null = null

    const cleanup = () => {
      script.removeEventListener('load', handleLoad)
      script.removeEventListener('error', handleError)
      if (timer !== null) {
        window.clearTimeout(timer)
        timer = null
      }
    }

    const succeed = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }

    const fail = (message: string) => {
      if (settled) return
      settled = true
      cleanup()
      // Неудачный тег не оставляем в DOM: повторная попытка должна создать
      // новый <script> и заново запустить загрузку.
      script.remove()
      reject(new Error(message))
    }

    const handleLoad = () => succeed()
    const handleError = () => fail('Не удалось загрузить Google Identity Services')

    // Слушатели добавляем до вставки: событие load не должно потеряться.
    script.addEventListener('load', handleLoad)
    script.addEventListener('error', handleError)

    if (created) {
      script.src = GIS_SCRIPT_SRC
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }

    if (!settled) {
      timer = window.setTimeout(() => {
        fail('Google Identity Services не загрузился за 8 секунд')
      }, GIS_LOAD_TIMEOUT_MS)
    }
  })
}

/**
 * Гарантирует, что скрипт GIS загружен.
 *
 * Повторные вызовы возвращают тот же промис. Если GIS уже доступен в
 * window.google, промис резолвится сразу и <script> не создаётся. После
 * ошибки или таймаута состояние сбрасывается — следующий вызов повторит
 * загрузку.
 */
export function ensureGoogleGis(): Promise<void> {
  if (getGoogleId()) return Promise.resolve()
  if (loadPromise) return loadPromise

  const promise = loadGisScript()
  loadPromise = promise

  // Сбрасываем кэш только при ошибке: успешная загрузка остаётся синглтоном.
  void promise.catch(() => {
    if (loadPromise === promise) loadPromise = null
  })

  return promise
}

export interface GoogleSignInOptions {
  clientId: string
  onCredential: (credential: string) => void
}

export interface RenderGoogleButtonOptions extends GoogleSignInOptions {
  /** Язык интерфейса кнопки; по умолчанию русский. */
  locale?: string
}

/**
 * Проверяет ответ GIS: пустой credential и credential, выпущенный для другого
 * Client ID, игнорируются.
 */
function credentialFromResponse(
  response: GoogleCredentialResponse,
  clientId: string,
): string | null {
  const credential = response.credential
  if (typeof credential !== 'string' || credential.trim().length === 0) return null

  if (
    typeof response.clientId === 'string' &&
    response.clientId.length > 0 &&
    response.clientId !== clientId
  ) {
    return null
  }

  return credential
}

/**
 * Настраивает GIS с отключённым авто-выбором и фильтрацией ответов.
 * Вызывается после ensureGoogleGis().
 */
export function initializeGoogleSignIn({
  clientId,
  onCredential,
}: GoogleSignInOptions): void {
  const id = getGoogleId()
  if (!id) throw new Error('Google Identity Services не загружен')

  id.initialize({
    client_id: clientId,
    auto_select: false,
    callback: (response) => {
      const credential = credentialFromResponse(response, clientId)
      if (credential) onCredential(credential)
    },
  })
}

/**
 * Настраивает GIS и рисует официальную кнопку входа в указанный контейнер.
 * Вызывается после ensureGoogleGis().
 */
export function renderGoogleButton(
  element: HTMLElement,
  { clientId, onCredential, locale = DEFAULT_LOCALE }: RenderGoogleButtonOptions,
): void {
  initializeGoogleSignIn({ clientId, onCredential })

  const id = getGoogleId()
  if (!id) throw new Error('Google Identity Services не загружен')

  const options: GoogleButtonConfiguration = {
    theme: 'filled_black',
    size: 'large',
    text: 'signin_with',
    shape: 'rectangular',
    locale,
  }

  id.renderButton(element, options)
}

/** Безопасно отключает авто-выбор, если GIS уже загружен. */
export function disableAutoSelect(): void {
  getGoogleId()?.disableAutoSelect()
}
