# Uppic - 独立图片上传微服务

一个完全解耦的图片上传模块，基于 Cloudflare R2 存储，可作为独立微服务运行，通过 API 与主项目对接。

## 架构

```
modules/uppic/
├── backend/                # FastAPI 后端服务
│   ├── main.py            # 服务入口
│   ├── config.py          # 配置管理
│   ├── storage.py         # R2 存储服务
│   └── requirements.txt   # Python 依赖
├── frontend/              # React 前端组件
│   ├── ImageUploadButton.tsx  # 上传按钮组件
│   ├── useImageUpload.ts      # 上传 Hook
│   ├── types.ts               # 类型定义
│   └── index.ts               # 导出入口
└── README.md
```

## 快速开始

### 1. 配置环境变量

在项目根目录 `.env` 文件中添加：

```env
# Uppic 服务配置
UPPIC_PORT=3900
UPPIC_CORS_ORIGINS=http://localhost:3721,http://localhost:5173

# Cloudflare R2 配置
R2_ACCOUNT_ID=你的账户ID
R2_ACCESS_KEY_ID=你的访问密钥ID
R2_SECRET_ACCESS_KEY=你的访问密钥
R2_BUCKET_NAME=你的存储桶名称
R2_PUBLIC_DOMAIN=https://你的公开访问域名
```

### 2. 启动后端服务

```bash
cd modules/uppic/backend
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 3900 --reload
```

### 3. 前端集成

在主项目中导入组件：

```tsx
import { ImageUploadButton, useImageUpload } from '../../modules/uppic/frontend'

// 使用组件
<ImageUploadButton
  config={{ apiBase: '/uppic', userId: user.id }}
  onUploadSuccess={(result) => console.log('上传成功:', result.url)}
/>

// 或使用 Hook
const { uploadImage, isUploading, error } = useImageUpload({ apiBase: '/uppic' })
```

### 4. 配置代理（Vite）

在 `vite.config.ts` 中添加代理：

```ts
export default defineConfig({
  server: {
    proxy: {
      '/uppic': {
        target: 'http://localhost:3900',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/uppic/, '')
      }
    }
  }
})
```

## API 接口

### POST /api/upload/sign

获取预签名上传 URL。

**请求体：**
```json
{
  "filename": "image.jpg",
  "contentType": "image/jpeg",
  "folder": "chat-images",
  "userId": "user-123"
}
```

**响应：**
```json
{
  "uploadUrl": "https://xxx.r2.cloudflarestorage.com/...",
  "key": "chat-images/user-123/abc12345_image.jpg",
  "publicUrl": "https://cdn.example.com/chat-images/user-123/abc12345_image.jpg"
}
```

## 工作流程

```
1. 用户选择图片
2. 前端调用 /api/upload/sign 获取预签名 URL
3. 前端直接 PUT 上传到 R2（不经过后端）
4. 上传完成，返回公开访问 URL
```

## 特性

- ✅ 完全解耦，独立部署
- ✅ 客户端直传 R2，减轻服务器压力
- ✅ 预签名 URL，安全可控
- ✅ 支持 JPEG、PNG、GIF、WebP
- ✅ 文件大小限制（默认 10MB）
- ✅ 水墨风格 UI 组件
