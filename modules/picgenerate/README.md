# Picgenerate - AI 图像生成模块

独立的 AI 图像生成微服务，支持流式 thinking 输出。

## 执行流程

```
用户输入中文 prompt
       ↓
📝 翻译 AI（TRANSLATOR）
   将中文 prompt 优化为英文绘图 prompt
   ← 流式输出 thinking 过程
       ↓
🎨 绘图 AI（IMAGE）
   根据英文 prompt 生成图像
   ← 输出 thinking 状态
       ↓
☁️ 上传到 R2
   返回公开访问链接
       ↓
返回结果给主项目
```

## 功能特性

- 🔄 **Prompt 智能优化**：自动将中文描述翻译优化为专业英文绘图 prompt
- 🎨 **支持多种绘图模型**：兼容 OpenAI 格式的图像生成 API
- 💭 **流式 Thinking 输出**：实时显示处理过程，用户体验更好
- ☁️ **R2 云存储**：图像自动上传，返回 CDN 加速链接
- ⚡ **长期缓存**：AI 图像不可变，设置 1 年缓存

## 目录结构

```
picgenerate/
├── backend/
│   ├── config.py              # 配置管理
│   ├── prompt_translator.py   # Prompt 翻译优化服务
│   ├── ai_generator.py        # 图像生成服务
│   ├── storage.py             # R2 存储服务
│   ├── main.py                # FastAPI 入口
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── types.ts               # 类型定义
│   ├── useImageGenerate.ts    # React Hook
│   ├── ImageGeneratePanel.tsx # UI 面板组件
│   └── index.ts               # 模块导出
└── README.md
```

## 环境变量配置

在项目根目录的 `.env` 文件中添加：

```bash
# ========== AI 绘图服务配置 (picgenerate) ==========

# [翻译/优化 AI] 用于将中文 prompt 翻译优化为英文绘图 prompt
PICGEN_TRANSLATOR_API_KEY=your-translator-api-key
PICGEN_TRANSLATOR_API_BASE=https://your-translator-api-base/v1
PICGEN_TRANSLATOR_MODEL=gpt-4o-mini

# [绘图 AI] 用于根据英文 prompt 生成图像
PICGEN_IMAGE_API_KEY=your-image-api-key
PICGEN_IMAGE_API_BASE=https://your-image-api-base/v1
PICGEN_IMAGE_MODEL=gemini-3-image

# 服务端口
PICGEN_PORT=3903
PICGEN_CORS_ORIGINS=http://localhost:3721,http://localhost:38721

# R2 配置（与其他模块共用，无需重复配置）
```

## API 接口

### 1. 流式生成（推荐）

```http
POST /api/generate/stream
Content-Type: application/json

{
  "prompt": "一只戴着墨镜的橘猫在沙滩上晒太阳",
  "size": "1024x1024",
  "quality": "standard",
  "user_id": "user123"
}
```

返回 SSE 流：

```
data: {"type": "thinking", "data": "📝 正在分析您的描述..."}
data: {"type": "thinking", "data": "\n原始描述: 一只戴着墨镜的橘猫..."}
data: {"type": "thinking", "data": "\n🔄 正在优化为专业绘图提示词..."}
data: {"type": "thinking", "data": "An orange tabby cat wearing..."}
data: {"type": "thinking", "data": "\n🎨 正在调用 gemini-3-image 生成图像..."}
data: {"type": "thinking", "data": "\n☁️ 正在上传图像到云存储..."}
data: {"type": "content", "data": {"success": true, "image_url": "https://...", "english_prompt": "..."}}
data: {"type": "done"}
```

### 2. 同步生成（简单模式）

```http
POST /api/generate
Content-Type: application/json

{
  "prompt": "一只戴着墨镜的橘猫在沙滩上晒太阳"
}
```

返回：

```json
{
  "success": true,
  "image_url": "https://img.example.com/generated/...",
  "english_prompt": "An orange tabby cat wearing stylish sunglasses..."
}
```

## 前端使用

### 方式 1: 使用 Hook（推荐）

```tsx
import { useImageGenerate } from '@picgenerate'

function MyComponent() {
  const { generate, isGenerating, thinking, result, error } = useImageGenerate()
  
  const handleGenerate = async () => {
    const res = await generate({
      prompt: '一只可爱的猫咪',
      size: '1024x1024'
    })
    
    if (res.success) {
      console.log('图像地址:', res.imageUrl)
      console.log('英文提示词:', res.englishPrompt)
    }
  }
  
  return (
    <div>
      <button onClick={handleGenerate} disabled={isGenerating}>
        生成图像
      </button>
      
      {/* 显示 thinking 过程 */}
      {thinking && (
        <pre className="thinking-box">{thinking}</pre>
      )}
      
      {/* 显示结果 */}
      {result?.imageUrl && (
        <img src={result.imageUrl} alt="生成的图像" />
      )}
    </div>
  )
}
```

### 方式 2: 使用面板组件

```tsx
import { ImageGeneratePanel } from '@picgenerate'

function App() {
  return (
    <ImageGeneratePanel
      userId="user123"
      onImageGenerated={(url, englishPrompt) => {
        console.log('生成完成:', url)
        console.log('英文提示词:', englishPrompt)
      }}
      onClose={() => {
        // 关闭面板
      }}
    />
  )
}
```

## 本地开发

```bash
cd modules/picgenerate/backend
pip install -r requirements.txt
uvicorn main:app --reload --port 3903
```

## Docker 部署

```bash
docker compose up -d --build picgenerate
```

## 端口说明

| 环境 | 端口 |
|------|------|
| 内部 | 3903 |
| 外部映射 | 30903 |

详见 [port.md](../../port.md)
