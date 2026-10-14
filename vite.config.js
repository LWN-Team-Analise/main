import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

/*
 * Two apps, one site:
 *   /       the LWN website (index.html, src/)
 *   /core/  LWN Core, the company's management platform (core/index.html,
 *           core/src/), with its API under /api (core/server, api/index.js)
 * Each page loads only its own code and styles.
 */

// Any page address inside /core (not a file) opens LWN Core, as the
// rewrites in vercel.json do in production.
const coreFallback = (req, _res, next) => {
  const [pathname] = req.url.split('?')
  const isPage = (pathname === '/core' || pathname.startsWith('/core/')) && !path.extname(pathname)
  if (isPage && req.headers.accept?.includes('text/html')) req.url = '/core/index.html'
  next()
}

const coreApp = {
  name: 'lwn-core-app',
  configureServer(server) {
    server.middlewares.use(coreFallback)
  },
  configurePreviewServer(server) {
    server.middlewares.use(coreFallback)
  },
}

// The LWN Core API runs locally on port 3001 (npm run api:dev).
const api = { '/api': { target: 'http://localhost:3001', changeOrigin: true } }

export default defineConfig({
  plugins: [react(), coreApp],
  resolve: {
    alias: {
      // the LWN Core code imports its own files as '@/...'
      '@': path.resolve(import.meta.dirname, 'core/src'),
    },
  },
  server: {
    port: 3000,
    open: true,
    proxy: api,
  },
  preview: {
    proxy: api,
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(import.meta.dirname, 'index.html'),
        core: path.resolve(import.meta.dirname, 'core/index.html'),
      },
    },
  },
  publicDir: 'public',
  assetsInclude: ['**/*.png', '**/*.jpg', '**/*.jpeg', '**/*.webp']
})
