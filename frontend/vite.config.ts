import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@uppic': path.resolve(__dirname, '../modules/uppic/frontend'),
      '@upword': path.resolve(__dirname, '../modules/upword/frontend'),
      '@upgrade': path.resolve(__dirname, '../modules/upgrade/frontend'),
    },
  },
  server: {
    port: 3721,
    proxy: {
      '/api': {
        target: 'http://localhost:9527',
        changeOrigin: true,
        // SSE 流式传输支持
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            // 检测 SSE 响应，禁用缓冲
            if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
              proxyRes.headers['cache-control'] = 'no-cache'
              proxyRes.headers['connection'] = 'keep-alive'
            }
          })
        },
      },
      // Uppic 独立图片上传服务代理 (Docker 端口 13900)
      '/uppic': {
        target: 'http://localhost:13900',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/uppic/, ''),
      },
      // Upword 独立文档上传解析服务代理 (Docker 端口 13901)
      '/upword': {
        target: 'http://localhost:13901',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/upword/, ''),
      },
      // Upgrade 独立版本更新服务代理 (Docker 端口 13902)
      '/upgrade': {
        target: 'http://localhost:13902',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/upgrade/, ''),
      },
    },
  },
})
