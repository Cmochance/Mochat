# Upword - Word 文档上传解析服务

独立的 Word 文档上传解析微服务，支持 `.doc` 和 `.docx` 格式转换为 Markdown。

## 功能特性

- 📤 客户端直传 R2 (预签名 URL)
- 📄 Word 文档自动解析为 Markdown
- 🔄 多级回退解析策略 (markitdown → mammoth → python-docx)
- 🎯 完全解耦，可独立部署

## 目录结构

```
upword/
├── backend/
│   ├── config.py      # 配置管理
│   ├── storage.py     # R2 存储服务
│   ├── parser.py      # 文档解析器
│   ├── main.py        # FastAPI 应用
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── types.ts       # 类型定义
│   ├── useDocUpload.ts # React Hook
│   ├── DocUploadButton.tsx # 上传按钮组件
│   └── index.ts       # 模块导出
└── README.md
```

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 服务状态 |
| GET | `/health` | 健康检查 |
| POST | `/api/upload/sign` | 获取预签名上传 URL |
| POST | `/api/parse` | 解析已上传的文档 |

## 使用示例

### 前端 Hook

```tsx
import { useDocUpload } from '@upword'

function MyComponent() {
  const { uploadAndParse, isProcessing, error } = useDocUpload({
    apiBase: '/upword',
    folder: 'documents',
    userId: 'user123',
  })

  const handleFileSelect = async (file: File) => {
    const result = await uploadAndParse(file)
    if (result) {
      console.log('Markdown:', result.markdown)
    }
  }

  return (
    // ...
  )
}
```

### 前端组件

```tsx
import { DocUploadButton } from '@upword'

<DocUploadButton
  config={{ apiBase: '/upword', userId: 'user123' }}
  onUploadComplete={(result) => console.log(result.markdown)}
  onError={(error) => alert(error)}
>
  上传文档
</DocUploadButton>
```

## 环境变量

```bash
# 服务配置
UPWORD_PORT=3901
UPWORD_CORS_ORIGINS=http://localhost:3721

# R2 配置
R2_ACCOUNT_ID=xxx
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_BUCKET_NAME=xxx
R2_PUBLIC_DOMAIN=https://xxx
```

## 解析策略

1. **markitdown** (首选) - 微软官方工具，格式保留最佳
2. **mammoth** (备选) - 专业 docx 转换，格式良好
3. **python-docx** (回退) - 基础提取，保留标题和表格
