import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Patch GLOBAL de supertest : ses serveurs éphémères écoutent sur 127.0.0.1 — sinon, sur macOS,
    // un listener IPv4 d'un autre process peut capter leur port et répondre 404 (détail dans le fichier).
    setupFiles: ['./tests/setup/supertest-loopback.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
