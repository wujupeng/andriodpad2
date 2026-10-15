import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@ui': path.resolve(__dirname, './src/ui'),
      '@orchestration': path.resolve(__dirname, './src/orchestration'),
      '@core': path.resolve(__dirname, './src/core'),
      '@adapter': path.resolve(__dirname, './src/adapter'),
      '@infrastructure': path.resolve(__dirname, './src/infrastructure'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})