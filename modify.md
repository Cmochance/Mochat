# 图片上传功能实现方案

## 当前状态

项目中已存在 `modules/uppic/` 模块，包含：
- 后端服务（FastAPI + Cloudflare R2）
- 前端组件（React Hook + 上传按钮）
- 前端已集成 `@uppic` 模块到 `InputArea.tsx`

**但存在以下问题：**

1. **uppic 服务未部署** - `docker-compose.yml` 中没有配置 uppic 服务
2. **nginx 未配置 uppic 代理** - 生产环境无法访问 uppic API
3. **缺少拖拽上传功能** - 当前只支持点击上传

---

## 解决方案

### 1. 在 docker-compose.yml 中添加 uppic 服务

```yaml
services:
  # ... 现有服务 ...

  # Uppic 图片上传服务
  uppic:
    build:
      context: ./modules/uppic/backend
      dockerfile: Dockerfile
    ports:
      - "3900:3900"
    environment:
      - UPPIC_PORT=3900
      - UPPIC_CORS_ORIGINS=http://localhost:3721,http://localhost:38721
      - R2_ACCOUNT_ID=${R2_ACCOUNT_ID:-}
      - R2_ACCESS_KEY_ID=${R2_ACCESS_KEY_ID:-}
      - R2_SECRET_ACCESS_KEY=${R2_SECRET_ACCESS_KEY:-}
      - R2_BUCKET_NAME=${R2_BUCKET_NAME:-}
      - R2_PUBLIC_DOMAIN=${R2_PUBLIC_DOMAIN:-}
    restart: unless-stopped
```

### 2. 为 uppic 后端创建 Dockerfile

**文件**: `modules/uppic/backend/Dockerfile`

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 3900

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3900"]
```

### 3. 更新 nginx.conf 添加 uppic 代理

**文件**: `frontend/nginx.conf`

在 `location /api` 之后添加：

```nginx
# Uppic 图片上传服务代理
location /uppic/ {
    proxy_pass http://uppic:3900/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # 上传文件大小限制
    client_max_body_size 10M;
}
```

### 4. 更新 frontend 服务依赖

**文件**: `docker-compose.yml`

```yaml
frontend:
  # ...
  depends_on:
    - backend
    - uppic  # 添加 uppic 依赖
```

### 5. 为 InputArea.tsx 添加拖拽上传功能

**文件**: `frontend/src/pages/Chat/components/InputArea.tsx`

需要修改的内容：

#### 5.1 添加导入和状态

```typescript
import { useState, useRef, useEffect, DragEvent } from 'react'
// ... 其他导入

export default function InputArea({ onSend, disabled = false }: InputAreaProps) {
  // ... 现有状态
  const [isDragging, setIsDragging] = useState(false)
```

#### 5.2 添加拖拽事件处理函数

```typescript
// 处理拖拽进入
const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
  e.preventDefault()
  e.stopPropagation()
  if (!disabled && !isUploading) {
    setIsDragging(true)
  }
}

// 处理拖拽离开
const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
  e.preventDefault()
  e.stopPropagation()
  // 只有当离开整个容器时才取消拖拽状态
  const rect = e.currentTarget.getBoundingClientRect()
  const x = e.clientX
  const y = e.clientY
  if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
    setIsDragging(false)
  }
}

// 处理拖拽悬停
const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
  e.preventDefault()
  e.stopPropagation()
}

// 处理文件放置
const handleDrop = (e: DragEvent<HTMLDivElement>) => {
  e.preventDefault()
  e.stopPropagation()
  setIsDragging(false)

  if (disabled || isUploading) return

  const files = e.dataTransfer.files
  if (files.length === 0) return

  const file = files[0]
  
  // 检查是否为图片
  if (!file.type.startsWith('image/')) {
    return
  }

  const validation = validateImage(file)
  if (!validation.valid) {
    return
  }

  const previewUrl = URL.createObjectURL(file)
  setImagePreview({ file, previewUrl })
  clearError()
}
```

#### 5.3 修改根容器添加拖拽事件和样式

```typescript
return (
  <motion.div
    className={`
      border-t border-paper-aged bg-paper-white/80 backdrop-blur-sm p-4
      relative
      ${isDragging ? 'ring-2 ring-ink-medium ring-inset' : ''}
    `}
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    onDragEnter={handleDragEnter}
    onDragLeave={handleDragLeave}
    onDragOver={handleDragOver}
    onDrop={handleDrop}
  >
    {/* 拖拽提示覆盖层 */}
    <AnimatePresence>
      {isDragging && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-paper-cream/90 flex items-center justify-center z-10 border-2 border-dashed border-ink-medium rounded-sm"
        >
          <div className="flex flex-col items-center gap-2 text-ink-medium">
            <ImagePlus size={32} />
            <span className="text-lg font-body">释放以上传图片</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* ... 其余现有代码保持不变 ... */}
  </motion.div>
)
```

---

## 完整修改文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `modules/uppic/backend/Dockerfile` | 新建 | uppic 服务的 Docker 镜像配置 |
| `docker-compose.yml` | 修改 | 添加 uppic 服务配置 |
| `frontend/nginx.conf` | 修改 | 添加 uppic 代理配置 |
| `frontend/src/pages/Chat/components/InputArea.tsx` | 修改 | 添加拖拽上传功能 |

---

## 环境变量配置

确保 `.env` 文件中包含 R2 配置（如果要使用图片上传功能）：

```env
# Cloudflare R2 配置
R2_ACCOUNT_ID=你的账户ID
R2_ACCESS_KEY_ID=你的访问密钥ID
R2_SECRET_ACCESS_KEY=你的访问密钥
R2_BUCKET_NAME=你的存储桶名称
R2_PUBLIC_DOMAIN=https://你的公开访问域名
```

---

## 部署后验证

1. 运行 `docker-compose up -d --build`
2. 检查 uppic 服务状态：`docker ps | grep uppic`
3. 测试 uppic 健康检查：`curl http://localhost:3900/health`
4. 访问前端，确认图片上传按钮可见
5. 测试点击上传和拖拽上传功能
