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
      '@picgenerate': path.resolve(__dirname, '../modules/picgenerate/frontend'),
      '@pptgen': path.resolve(__dirname, '../modules/pptgen/frontend'),
    },
  },
  server: {
    port: 3721,
    proxy: {
      '/api': {
        target: 'http://localhost:9527',
        changeOrigin: true,
        ws: true,
        // SSE 流式传输优化
        configure: (proxy) => {
          // 禁用 http-proxy 的 proxyRes 缓冲
          proxy.on('proxyRes', (proxyRes, req, res) => {
            // 检测 SSE 响应
            if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
              // 设置响应头禁用各层缓冲
              res.setHeader('Cache-Control', 'no-cache')
              res.setHeader('Connection', 'keep-alive')
              res.setHeader('X-Accel-Buffering', 'no')
              
              // 关键：将 socket 的 timeout 设为 0，禁用 Nagle 算法延迟
              if (res.socket) {
                res.socket.setNoDelay(true)
                res.socket.setTimeout(0)
              }
            }
          })
        },
      },
      // Uppic 独立图片上传服务代理 (Docker 端口 13900)
      '/uppic': {
        target: 'http://localhost:33900',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/uppic/, ''),
      },
      // Upword 独立文档上传解析服务代理 (Docker 端口 13901)
      '/upword': {
        target: 'http://localhost:33901',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/upword/, ''),
      },
      // Upgrade 独立版本更新服务代理 (Docker 端口 13902)
      '/upgrade': {
        target: 'http://localhost:33902',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/upgrade/, ''),
      },
      // Picgenerate AI 图像生成服务代理 (Docker 端口 30903)
      '/picgen': {
        target: 'http://localhost:30903',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/picgen/, ''),
      },
      // PPT 生成服务代理 (Docker 端口 30904)
      '/pptgen': {
        target: 'http://localhost:30904',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/pptgen/, ''),
      },
    },
  },
})
