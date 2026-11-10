import { defineConfig } from 'vite'

export default defineConfig({
  // Relative asset paths so the packed .ehpk works from any base URL.
  base: './',
  server: { host: true, port: 5173 },
  build: { target: 'esnext' },
})
