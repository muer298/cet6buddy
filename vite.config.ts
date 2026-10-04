import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [VitePWA({
    registerType: 'prompt',
    includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
    manifest: {
      name: 'CET6 Buddy 六级学习伙伴',
      short_name: 'CET6 Buddy',
      description: '可复习、可订正、可组队的六级学习伙伴',
      theme_color: '#6d5dfc',
      background_color: '#f7f5fb',
      display: 'standalone',
      start_url: '/#today',
      scope: '/',
      lang: 'zh-CN',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      navigateFallback: '/index.html',
      cleanupOutdatedCaches: true,
      clientsClaim: false,
      skipWaiting: false,
      runtimeCaching: [
        {
          urlPattern: ({ request }) => request.destination === 'font' || request.destination === 'image',
          handler: 'CacheFirst',
          options: { cacheName: 'cet6-static-assets', expiration: { maxEntries: 40, maxAgeSeconds: 30 * 24 * 60 * 60 } },
        },
      ],
    },
  })],
  server: { host: '127.0.0.1', port: 4173 },
  preview: { host: '127.0.0.1', port: 4173 },
  build: { minify: 'esbuild', cssMinify: 'esbuild' },
});
