/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // three.js is ~770 kB on its own; that is inherent to a 3D app and is
    // isolated in its own long-cached chunk, so warn only above it.
    chunkSizeWarningLimit: 800,
    // Split the heavy, rarely-changing 3D libraries from app code so a
    // redeploy of the app does not invalidate the whole cached bundle.
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [
            { name: 'three', test: /node_modules[\\/](three|three-stdlib)[\\/]/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // Data/solver tests run in node; component tests opt into jsdom
    // via a per-file `// @vitest-environment jsdom` pragma.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
