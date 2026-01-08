# 🎨 Mochat - 水墨风格AI对话平台

一个具有中国传统水墨风格的AI对话网站，支持流式输出和思考过程展示。

## ✨ 特性

- 🖌️ **水墨风格UI** - 传统中国美学设计
- 💬 **流式对话** - 实时流式输出AI回复
- 🧠 **思考展示** - Thinking内容独立显示，默认折叠
- 🔐 **用户系统** - 完整的登录注册功能
- 📊 **后台管理** - 用户管理和系统配置

## 🏗️ 技术栈

### 前端
- React 18 + TypeScript
- Vite
- TailwindCSS
- Zustand
- Framer Motion

### 后端
- FastAPI
- SQLAlchemy 2.0
- SQLite
- JWT认证

## 📁 项目结构

```
Mochat/
├── frontend/          # 前端项目
│   ├── src/
│   │   ├── pages/     # 页面模块（解耦）
│   │   ├── components/# 公共组件
│   │   ├── hooks/     # 自定义Hooks
│   │   ├── services/  # API服务
│   │   ├── stores/    # 状态管理
│   │   └── styles/    # 全局样式
│   └── ...
│
├── backend/           # 后端项目
│   ├── app/
│   │   ├── api/       # API路由
│   │   ├── core/      # 核心配置
│   │   ├── db/        # 数据库模块
│   │   ├── services/  # 业务服务
│   │   └── schemas/   # 数据模型
│   └── ...
└── ...
```

## 🚀 快速开始

### 后端启动

```bash
# 先在根目录配置环境变量
cp .env.example .env
# 编辑 .env 填写 AI_API_KEY 等配置

cd backend
python -m venv venv
venv\Scripts\activate  # Windows
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 9527
```

### 前端启动

```bash
cd frontend
npm install
npm run dev
```

## 📝 环境变量配置

在项目根目录创建 `.env` 文件（复制 `.env.example`）：

```bash
cp .env.example .env
```

然后编辑 `.env` 配置：

```env
SECRET_KEY=your-secret-key
DATABASE_URL=sqlite+aiosqlite:///./mochat.db
AI_API_KEY=your-openai-api-key
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4
CORS_ORIGINS=http://localhost:3721
```

## 🌐 端口配置

- **前端：** http://localhost:3721
- **后端API：** http://localhost:9527
- **API文档：** http://localhost:9527/docs

## 📄 License

MIT License
