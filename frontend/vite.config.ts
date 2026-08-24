import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const apiTarget = process.env.VITE_PROXY_TARGET || 'http://backend:8050'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 3000,
    host: true,
    strictPort: true,
    // Browser reaches Vite via published host port (3050), not container 3000
    hmr: {
      host: '127.0.0.1',
      clientPort: Number(process.env.VITE_HMR_CLIENT_PORT || 3050),
      protocol: 'ws',
    },
    watch: {
      usePolling: true,
      interval: 800,
    },
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/ws': {
        target: apiTarget.replace(/^http/, 'ws'),
        ws: true,
      },
    },
  },
})
