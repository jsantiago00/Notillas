/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'

// `npm run dev:lan` (modo "lan") sirve por HTTPS con un certificado autofirmado para
// probar desde el celular o la tablet en la red local: Pointer Events y la presión
// funcionan igual, pero el navegador no registra el service worker con ese certificado.
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    mode === 'lan' && basicSsl({ name: 'notillas-lan' }),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'logo.svg'],
      manifest: {
        name: 'Notillas',
        short_name: 'Notillas',
        description: 'Notas a mano alzada con lápiz, sincronizadas entre tus dispositivos.',
        lang: 'es-AR',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f6f3ec',
        theme_color: '#f6f3ec',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: 'index.html',
        // /__/auth/* lo sirve Firebase Hosting (login con redirect): nunca desde la caché
        navigateFallbackDenylist: [/^\/__\//],
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { host: mode === 'lan' ? true : undefined },
  build: { target: 'es2022', sourcemap: true },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
}))
