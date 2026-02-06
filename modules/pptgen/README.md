# PPT 生成模块 (pptgen)

基于 AI 的 PPT 自动生成模块，支持流式输出生成过程。

## 架构

```
用户 -> 后端(AI生成JSON) -> Cloud Run(PPT生成+上传R2) -> 返回R2链接 -> 前端
```

## 目录结构

```
modules/pptgen/
├── backend/          # 后端微服务 (FastAPI)
│   ├── config.py     # 配置管理
│   ├── main.py       # 主入口
│   ├── ai_generator.py      # AI JSON 生成
│   ├── cloudrun_client.py   # Cloud Run 客户端
│   ├── storage.py    # R2 存储（备用）
│   ├── Dockerfile
│   └── requirements.txt
├── cloudrun/         # Cloud Run 服务 (Python)
│   └── main.py       # PPT 生成 + R2 上传服务
├── frontend/         # 前端组件
│   ├── types.ts      # 类型定义
│   ├── usePPTGenerate.ts  # React Hook
│   └── index.ts      # 导出入口
└── README.md
```

## 配置

### 环境变量

```env
# PPT 生成模块配置
PPTGEN_AI_API_KEY=xxx           # AI API Key
PPTGEN_AI_API_BASE=xxx          # AI API Base URL
PPTGEN_AI_MODEL=gpt-4           # AI 模型名称
PPTGEN_PORT=3904                # 后端服务端口
PPTGEN_CORS_ORIGINS=xxx         # CORS 配置

# Cloud Run 配置
PPTGEN_CLOUDRUN_URL=https://xxx.run.app  # Cloud Run 服务 URL
PPTGEN_CLOUDRUN_SECRET=xxx      # Cloud Run 认证密钥（可选）

# R2 配置（共用）
R2_ACCOUNT_ID=xxx
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_BUCKET_NAME=xxx
R2_PUBLIC_DOMAIN=xxx
```

## 部署

### 1. 部署 Cloud Run 服务

Cloud Run 服务使用 Python + python-pptx，负责生成 PPT 并上传到 R2。

```bash
# 部署到 Cloud Run (使用 functions-framework)
gcloud functions deploy pptgen \
  --gen2 \
  --runtime=python311 \
  --region=asia-east1 \
  --source=. \
  --entry-point=pptgen \
  --trigger-http \
  --allow-unauthenticated \
  --set-env-vars AUTH_TOKEN=xxx,R2_ACCOUNT_ID=xxx,R2_ACCESS_KEY_ID=xxx,R2_SECRET_ACCESS_KEY=xxx,R2_BUCKET_NAME=xxx,R2_PUBLIC_DOMAIN=xxx
```

Cloud Run 环境变量：
```env
AUTH_TOKEN=your-secret              # 鉴权密钥
R2_ACCOUNT_ID=xxx                   # R2 账户 ID
R2_ACCESS_KEY_ID=xxx                # R2 访问密钥
R2_SECRET_ACCESS_KEY=xxx            # R2 密钥
R2_BUCKET_NAME=xxx                  # R2 存储桶名称
R2_PUBLIC_DOMAIN=https://xxx.com    # R2 公开访问域名
```

### 2. 部署后端服务

后端服务通过 docker-compose 与主项目一起部署。

### 3. 前端集成

在主项目的前端中引用模块：

```typescript
import { usePPTGenerate } from '@pptgen';

const { generatePPT, isGenerating } = usePPTGenerate({
  apiBase: '/pptgen',
  userId: user?.id?.toString(),
});

// 生成 PPT
const result = await generatePPT(
  { prompt: '用户输入的主题' },
  (thinking) => {
    // 处理 thinking 输出
    console.log(thinking);
  }
);

if (result.success) {
  console.log('PPT URL:', result.pptUrl);
}
```

## API

### POST /api/generate/stream

流式生成 PPT，返回 SSE 流。

**请求体：**
```json
{
  "prompt": "PPT 主题描述",
  "user_id": "用户ID（可选）"
}
```

**SSE 响应：**
```
data: {"type": "thinking", "data": "正在分析..."}
data: {"type": "thinking", "data": "生成中..."}
data: {"type": "content", "data": {"success": true, "ppt_url": "...", "title": "..."}}
data: {"type": "done"}
```

### POST /api/generate

同步生成 PPT，直接返回结果。

**请求体：**
```json
{
  "prompt": "PPT 主题描述",
  "user_id": "用户ID（可选）"
}
```

**响应：**
```json
{
  "success": true,
  "ppt_url": "https://...",
  "title": "PPT 标题"
}
```

## JSON PPT 结构

AI 生成的 PPT JSON 结构示例：

```json
{
  "title": "演示文稿标题",
  "author": "作者",
  "theme": {
    "primaryColor": "#1a73e8",
    "backgroundColor": "#ffffff",
    "textColor": "#202124",
    "fontFamily": "Microsoft YaHei"
  },
  "slides": [
    {
      "type": "title",
      "title": "主标题",
      "subtitle": "副标题"
    },
    {
      "type": "content",
      "title": "内容页",
      "content": [
        { "type": "text", "value": "段落文本" },
        { "type": "bullet", "items": ["要点1", "要点2"] }
      ]
    },
    {
      "type": "thank-you",
      "title": "感谢观看"
    }
  ]
}
```

## 支持的幻灯片类型

| 类型 | 说明 |
|------|------|
| title | 标题页 |
| toc | 目录页 |
| section | 章节分隔页 |
| content | 内容页 |
| two-column | 双栏布局 |
| quote | 引用页 |
| thank-you | 结束页 |
