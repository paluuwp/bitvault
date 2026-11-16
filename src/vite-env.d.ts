/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** Публичный базовый URL Worker API. */
  readonly VITE_API_URL?: string
  /** Публичный Google OAuth Client ID. */
  readonly VITE_GOOGLE_CLIENT_ID?: string
}
