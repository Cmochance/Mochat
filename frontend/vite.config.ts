import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3721,
    proxy: {
      '/api': {
        target: 'http://localhost:9527',
        changeOrigin: true,
      },
      // Uppic 独立图片上传服务代理
      '/uppic': {
        target: 'http://localhost:3900',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/uppic/, ''),
      },
    },
  },
})
