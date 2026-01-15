# 流式输出问题排查报告

## 问题描述
AI对话网站无法实现流式输出，内容较长时需要等待很久然后一次性输出所有内容。

## 关键发现
**后端日志显示分块输出正常（72个chunk），但前端在所有chunk输出完成后才一次性收到数据。**

这说明：
- ✅ AI API 支持流式输出
- ✅ 后端 FastAPI 流式输出正常
- 🔴 **中间层存在缓冲问题**

---

## 本地开发环境排查（Vite 代理）

### 🔴 核心问题：Vite http-proxy 缓冲

**文件**: `frontend/vite.config.ts`

Vite 使用 `http-proxy` 库进行代理，该库默认会缓冲响应数据。当前配置：

```typescript
proxy: {
  '/api': {
    target: 'http://localhost:9527',
    changeOrigin: true,
    ws: true,
    configure: (proxy, options) => {
      proxy.on('proxyReq', (proxyReq, req, res) => {
        if (req.url?.includes('/chat/completions') || req.url?.includes('/regenerate')) {
          res.setHeader('X-Accel-Buffering', 'no')
        }
      })
      proxy.on('proxyRes', (proxyRes, req, res) => {
        if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
          proxyRes.headers['cache-control'] = 'no-cache'
          proxyRes.headers['connection'] = 'keep-alive'
          proxyRes.headers['x-accel-buffering'] = 'no'
        }
      })
    },
  },
}
```

**问题分析**:
1. `X-Accel-Buffering` 是 Nginx 特有的头部，对 Vite/http-proxy 无效
2. 设置响应头不能禁用 http-proxy 的内部缓冲
3. **缺少关键配置：`selfHandleResponse` 或直接绕过代理**

### 修复方案

#### 方案 1：绕过 Vite 代理，直接请求后端

**文件**: `frontend/src/services/chatService.ts`

将 SSE 请求直接发送到后端，不经过 Vite 代理：

```typescript
// 发送消息（流式）- 直接请求后端，绕过 Vite 代理
async sendMessage(
  sessionId: number,
  content: string,
  onChunk: (chunk: StreamChunk) => void,
  model?: string
): Promise<void> {
  const token = localStorage.getItem('token')
  
  // 开发环境直接请求后端，生产环境使用相对路径
  const baseUrl = import.meta.env.DEV ? 'http://localhost:9527' : ''
  
  const response = await fetch(`${baseUrl}/api/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      session_id: sessionId,
      content,
      model: model || undefined,
    }),
  })
  // ... 后续代码不变
}
```

同样修改 `regenerateResponse` 方法。

**注意**: 这需要后端配置 CORS 允许 `http://localhost:3721`（已配置）。

#### 方案 2：使用 selfHandleResponse 手动处理流式响应

**文件**: `frontend/vite.config.ts`

```typescript
proxy: {
  '/api': {
    target: 'http://localhost:9527',
    changeOrigin: true,
    ws: true,
    // 对 SSE 端点使用 selfHandleResponse
    configure: (proxy, options) => {
      proxy.on('proxyRes', (proxyRes, req, res) => {
        // 检测 SSE 响应
        if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
          // 设置响应头
          res.writeHead(proxyRes.statusCode || 200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          })
          
          // 直接管道传输，不缓冲
          proxyRes.pipe(res)
        }
      })
    },
  },
}
```

**注意**: 这种方式可能需要更复杂的处理来避免重复响应。

#### 方案 3（推荐）：为 SSE 端点单独配置代理

**文件**: `frontend/vite.config.ts`

```typescript
proxy: {
  // SSE 端点 - 特殊处理
  '/api/chat/completions': {
    target: 'http://localhost:9527',
    changeOrigin: true,
  },
  '/api/chat/sessions': {
    target: 'http://localhost:9527',
    changeOrigin: true,
    // 只有 regenerate 端点需要特殊处理
    configure: (proxy) => {
      // 默认配置即可，http-proxy 对 SSE 应该能正常工作
    },
  },
  // 其他 API
  '/api': {
    target: 'http://localhost:9527',
    changeOrigin: true,
  },
}
```

---

## 生产环境排查（Nginx 代理）

### 🔴 Nginx 配置问题

**文件**: `frontend/nginx.conf`

```nginx
server {
    # Gzip压缩 - 全局开启
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    location /api {
        proxy_pass http://backend:9527;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        # ...
        
        # SSE 配置
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

#### 问题 1: 缺少 `gzip off` 

虽然 `gzip_types` 没有包含 `text/event-stream`，但全局 `gzip on` 可能影响代理响应处理。**`/api` location 中应显式禁用 gzip**。

#### 问题 2: 缺少关键的 TCP 配置

对于 SSE 流式传输，需要以下配置：
- `tcp_nodelay on` - 禁用 Nagle 算法，立即发送小数据包
- `tcp_nopush off` - 不等待缓冲区满就发送

#### 问题 3: `chunked_transfer_encoding off` 可能有问题

SSE 通常使用 chunked 传输编码，关闭它可能导致 Nginx 等待完整响应。

#### 问题 4: 缺少 `proxy_request_buffering off`

虽然设置了 `proxy_buffering off`（响应缓冲），但没有设置请求缓冲。

### 3. 前端代码 ✅ 正常

**文件**: `frontend/src/services/chatService.ts`、`frontend/src/stores/chatStore.ts`

前端使用 `ReadableStream` 正确处理流式数据，状态更新逻辑正常。

### 4. Docker 配置 ✅ 正常

**文件**: `backend/Dockerfile`

已设置 `PYTHONUNBUFFERED=1`。

---

## 🟢 修复建议

### 修复 Nginx 配置

**文件**: `frontend/nginx.conf`

将 `/api` location 修改为：

```nginx
# API代理
location /api {
    proxy_pass http://backend:9527;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
    
    # ========== SSE 流式传输关键配置 ==========
    
    # 1. 禁用所有缓冲
    proxy_buffering off;
    proxy_request_buffering off;
    proxy_cache off;
    
    # 2. 禁用 gzip（SSE 不应压缩）
    gzip off;
    
    # 3. 启用 chunked 传输（SSE 需要）
    chunked_transfer_encoding on;
    
    # 4. TCP 优化 - 立即发送小数据包
    tcp_nodelay on;
    tcp_nopush off;
    
    # 5. 超时设置
    proxy_read_timeout 86400s;
    proxy_send_timeout 86400s;
    
    # 6. 添加 SSE 相关响应头
    add_header X-Accel-Buffering no;
}
```

### 关键修改说明

| 配置项 | 原值 | 新值 | 说明 |
|--------|------|------|------|
| `gzip` | (继承全局 on) | `off` | SSE 不应压缩，压缩会导致缓冲 |
| `chunked_transfer_encoding` | `off` | `on` | SSE 需要 chunked 传输 |
| `tcp_nodelay` | (未设置) | `on` | 禁用 Nagle 算法，立即发送 |
| `tcp_nopush` | (未设置) | `off` | 不等待缓冲区满 |
| `proxy_request_buffering` | (未设置) | `off` | 禁用请求缓冲 |
| `X-Accel-Buffering` | (仅后端设置) | `add_header` | Nginx 层面也设置 |

---

## 验证步骤

### 本地开发环境验证

1. **直接测试后端 API（绕过 Vite 代理）**
   ```bash
   curl -N -X POST "http://localhost:9527/api/chat/completions" \
     -H "Authorization: Bearer 你的token" \
     -H "Content-Type: application/json" \
     -d '{"session_id":1,"content":"你好"}'
   ```
   如果逐行输出 `data: {...}` → 后端正常，问题在 Vite 代理

2. **浏览器直接请求后端**
   临时修改前端代码，将 fetch URL 改为 `http://localhost:9527/api/chat/completions`
   如果流式正常 → 确认是 Vite 代理问题

### 生产环境验证

修改 Nginx 配置后：
```bash
docker compose build frontend
docker compose up -d frontend
```

---

## 总结

| 环境 | 问题原因 | 修复方案 |
|------|----------|----------|
| 本地开发 (Vite) | http-proxy 缓冲响应 | 绕过代理直接请求后端 |
| 生产环境 (Nginx) | 缺少 SSE 关键配置 | 添加 gzip off、tcp_nodelay 等 |

**推荐优先修复本地开发环境**：修改 `chatService.ts`，在开发环境直接请求后端 `http://localhost:9527`。

---

## 2026-01-15 二次排查结果

### 排查背景

用户反馈：后端日志显示分块输出正常，但前端一次性收到所有数据。当前测试环境为**本地开发环境**，不经过 Nginx，而是通过 Vite 开发服务器代理。

### 确认的问题根源

**Vite 的 http-proxy 库默认缓冲响应数据**

Vite 使用 `http-proxy` (node-http-proxy) 作为代理中间件。该库在处理响应时会进行内部缓冲，导致 SSE 流式数据被合并后一次性发送给客户端。

当前 `vite.config.ts` 中的配置：
- `X-Accel-Buffering: no` - 这是 **Nginx 特有的头部**，对 http-proxy 完全无效
- `proxyRes` 事件中设置的响应头 - 只能修改头部，无法禁用 http-proxy 的内部缓冲机制

### 最终修复方案

#### 方案 A（推荐）：开发环境绕过 Vite 代理

**修改文件**: `frontend/src/services/chatService.ts`

```typescript
// 在文件顶部或 sendMessage 方法内
const getStreamBaseUrl = () => {
  // 开发环境直接请求后端，绕过 Vite 代理的缓冲问题
  // 生产环境使用相对路径，走 Nginx 代理
  return import.meta.env.DEV ? 'http://localhost:9527' : ''
}

// sendMessage 方法修改
async sendMessage(
  sessionId: number,
  content: string,
  onChunk: (chunk: StreamChunk) => void,
  model?: string
): Promise<void> {
  const token = localStorage.getItem('token')
  const baseUrl = getStreamBaseUrl()
  
  const response = await fetch(`${baseUrl}/api/chat/completions`, {
    // ... 其余代码不变
  })
}

// regenerateResponse 方法同样修改
async regenerateResponse(
  sessionId: number,
  onChunk: (chunk: StreamChunk) => void
): Promise<void> {
  const token = localStorage.getItem('token')
  const baseUrl = getStreamBaseUrl()
  
  const response = await fetch(`${baseUrl}/api/chat/sessions/${sessionId}/regenerate`, {
    // ... 其余代码不变
  })
}
```

**前提条件**: 后端 CORS 配置需要允许 `http://localhost:3721`

检查 `backend/app/core/config.py` 和 `.env`：
```
CORS_ORIGINS=http://localhost:3721,http://localhost:3000
```
✅ 已配置，无需修改。

#### 方案 B：修改 Vite 代理配置（备选）

如果不想修改前端代码，可以尝试在 Vite 配置中使用 `selfHandleResponse`：

**修改文件**: `frontend/vite.config.ts`

```typescript
'/api': {
  target: 'http://localhost:9527',
  changeOrigin: true,
  selfHandleResponse: true,  // 关键：自己处理响应
  configure: (proxy, options) => {
    proxy.on('proxyRes', (proxyRes, req, res) => {
      // 复制状态码和头部
      res.writeHead(proxyRes.statusCode || 200, proxyRes.headers)
      // 直接管道传输，不缓冲
      proxyRes.pipe(res)
    })
  },
}
```

**注意**: 此方案会影响所有 `/api` 请求，可能需要更精细的条件判断。

### 验证命令

```bash
# 1. 直接测试后端（绕过所有代理）
curl -N -X POST "http://localhost:9527/api/chat/completions" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"session_id":1,"content":"写一首诗"}'

# 预期结果：逐行输出 data: {"type":"...","data":"..."}
```

### 修复优先级

1. **本地开发环境** → 方案 A（修改 chatService.ts）
2. **生产环境** → 修改 nginx.conf（见上文 Nginx 配置部分）
