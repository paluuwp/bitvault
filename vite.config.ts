import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => ({
  // Относительные пути: сборка работает и в корне домена, и на GitHub Pages
  // в подкаталоге вида /имя-репозитория/.
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    // В тестах service worker не нужен: плагин генерирует файлы и virtual-модули.
    ...(mode !== 'test'
      ? [
          VitePWA({
            registerType: 'prompt',
            injectRegister: null,
            manifestFilename: 'manifest.webmanifest',
            includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'icons/*.png'],
            manifest: {
              id: './',
              name: 'BitVault — библиотека битов',
              short_name: 'BitVault',
              description:
                'Ваша личная библиотека битов. Всё хранится локально в браузере.',
              lang: 'ru',
              dir: 'ltr',
              start_url: './',
              scope: './',
              display: 'standalone',
              background_color: '#0A0A0D',
              theme_color: '#0A0A0D',
              categories: ['music', 'productivity'],
              icons: [
                {
                  src: 'icons/icon-192.png',
                  sizes: '192x192',
                  type: 'image/png',
                  purpose: 'any',
                },
                {
                  src: 'icons/icon-512.png',
                  sizes: '512x512',
                  type: 'image/png',
                  purpose: 'any',
                },
                {
                  src: 'icons/maskable-192.png',
                  sizes: '192x192',
                  type: 'image/png',
                  purpose: 'maskable',
                },
                {
                  src: 'icons/maskable-512.png',
                  sizes: '512x512',
                  type: 'image/png',
                  purpose: 'maskable',
                },
              ],
            },
            workbox: {
              globPatterns: ['**/*.{js,css,html,woff2}'],
              // Исключаем только сам воркер и его рантайм. Чанк
              // workbox-window грузится приложением через import() и обязан
              // попасть в precache, иначе офлайн-регистрация SW не работает.
              globIgnores: ['**/sw.js', '**/workbox-[0-9a-f]{8}.js'],
              navigateFallback: 'index.html',
              cleanupOutdatedCaches: true,
              clientsClaim: true,
              skipWaiting: false,
              maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
            },
            devOptions: { enabled: false },
          }),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    restoreMocks: true,
    alias: {
      // Плагин PWA в тестах отключён — подменяем виртуальный модуль заглушкой.
      'virtual:pwa-register': fileURLToPath(
        new URL('./src/test/virtualPwaRegister.ts', import.meta.url),
      ),
    },
  },
}))
