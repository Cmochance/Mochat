# 🎨 Mochat - 水墨风格AI对话平台

一个具有中国传统水墨风格的AI对话网站，支持流式输出和思考过程展示。

## ✨ 特性

- 🖌️ **水墨风格UI** - 传统中国美学设计
- 💬 **流式对话** - 实时流式输出AI回复
- 🧠 **思考展示** - Thinking内容独立显示，默认折叠
- 📚 **智能学习伴侣** - 文献研读、闪卡记忆、自适应测验、知识导图
- 🔍 **混合检索引擎** - BM25 + TF-IDF + 轻量级重排，精准定位知识片段
- 🖼️ **多模态输入** - 支持图片对话和文档问答
- 🔐 **用户系统** - 完整的登录注册功能，HttpOnly Cookie 保护
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
- SQLite / PostgreSQL
- JWT 认证（Access Token + Refresh Token）
- bcrypt 密码哈希

## 📁 项目结构

```
Mochat/
├── frontend/          # 前端项目
│   ├── src/
│   │   ├── pages/     # 页面模块（解耦）
│   │   ├── components/# 公共组件
│   │   ├── hooks/     # 自定义 Hooks
│   │   ├── services/  # API 服务
│   │   ├── stores/    # 状态管理
│   │   └── styles/    # 全局样式
│   └── ...
│
├── backend/           # 后端项目
│   ├── app/
│   │   ├── api/       # API 路由
│   │   ├── core/      # 核心配置和安全模块
│   │   ├── db/        # 数据库模块
│   │   ├── services/  # 业务服务
│   │   └── schemas/   # 数据模型
│   ├── scripts/       # 数据库迁移脚本
│   └── ...
└── ...
```

## 🚀 快速开始

### 后端启动

```bash
# 先在根目录配置环境变量
cp .env.example .env
# 编辑 .env 填写 AI_API_KEY 等配置
# ⚠️ 必须设置一个安全的 SECRET_KEY（至少32字符，包含大小写字母、数字、特殊符号中的三种）
# 生成安全密钥: python -c 'import secrets; print(secrets.token_urlsafe(32))'

cd backend
python -m venv venv
source venv/bin/activate  # macOS/Linux
# venv\Scripts\activate   # Windows
pip install -r requirements.txt

# 可选：安装向量检索增强依赖（需要 PyTorch，约 2GB）
# pip install -r requirements-enhanced.txt

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
# ⚠️ 安全密钥（必填！至少32字符，包含大小写字母、数字、特殊符号中的三种）
# 生成方法: python -c 'import secrets; print(secrets.token_urlsafe(32))'
SECRET_KEY=<生成的安全密钥>

# 数据库
DATABASE_URL=sqlite+aiosqlite:///./mochat.db

# 认证模式: legacy（本地JWT）或 supabase
AUTH_PROVIDER=legacy

# Refresh Token 有效期（天），默认 7 天
REFRESH_TOKEN_EXPIRE_DAYS=7

# Cookie 安全策略
COOKIE_SECURE=true        # 生产环境设为 true（仅 HTTPS）
COOKIE_SAMESITE=lax       # strict | lax | none

# AUTH_PROVIDER=supabase 时需要配置：
# SUPABASE_URL=https://your-project-ref.supabase.co
# SUPABASE_ANON_KEY=your-supabase-anon-key
# SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# AI 服务
AI_API_KEY=your-openai-api-key
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4

# CORS（允许的前端域名，逗号分隔）
CORS_ORIGINS=http://localhost:3721
```

### Supabase 迁移脚本

```bash
python backend/scripts/migrate_sqlite_to_supabase.py --help
```

### 清理旧的加密密码数据

如果从旧版本升级，可运行以下脚本清理数据库中不安全的 `password_encrypted` 字段：

```bash
# 预览模式（不修改数据）
python backend/scripts/migrate_remove_password_encrypted.py

# 执行清理
python backend/scripts/migrate_remove_password_encrypted.py --execute
```

## 🌐 端口配置

- **前端：** http://localhost:3721
- **后端API：** http://localhost:9527
- **API文档：** http://localhost:9527/docs

## 🔐 安全架构

Mochat 实现了多层安全防护：

### 认证与 Token 管理
- Access Token 通过 Authorization Header（Bearer）传输，Web 端仅存储在内存中
- Refresh Token 通过 HttpOnly Cookie 传输，JavaScript 无法读取，防止 XSS 窃取
- Refresh Token 使用轮转机制（Rotation），每次刷新后生成新 Token
- 桌面端（Electron）保留 localStorage 方式以兼容无 Cookie 域的场景

### 密码安全
- 使用 bcrypt 单向哈希存储密码，即使数据库泄露也无法还原原始密码
- 密码策略要求至少包含大小写字母、数字中的两种，支持常见特殊符号
- 密码修改后自动清除 Refresh Token，强制重新登录

### SECRET_KEY 强度验证
- 应用启动时强制验证 SECRET_KEY 强度（至少32字符，三种字符类型）
- 使用弱密钥或默认值时应用拒绝启动

### 输入安全
- 所有用户输入通过 Pydantic 模型进行验证（类型、长度、格式）
- 文件名自动净化，防止路径遍历攻击
- SQL 注入检测辅助日志（主防线为 SQLAlchemy ORM 参数化查询）
- HTML 标签自动剥离

### 安全 HTTP 头
每个响应自动附加安全头：
- `Content-Security-Policy`：限制资源加载来源
- `X-Content-Type-Options: nosniff`：防止 MIME 嗅探
- `X-Frame-Options: DENY`：防止点击劫持
- `Referrer-Policy: strict-origin-when-cross-origin`：防止信息泄露
- `Strict-Transport-Security`：强制 HTTPS（仅生产环境）
- 认证和用户接口自动设置 `Cache-Control: no-store`

### 速率限制
预定义的速率限制规则防止暴力破解：
- 注册：5次/小时
- 登录：10次/分钟
- 密码重置：3次/小时
- 验证码发送：10次/分钟
- 严重超限的 IP 自动阻止 5 分钟

### 安全审计日志
关键操作通过结构化日志记录，包含用户ID、IP地址、时间戳等信息。用户标识（邮箱/用户名）自动脱敏。

### 统一错误处理
- 未捕获异常不泄露内部堆栈信息
- 请求验证错误返回具体字段信息，便于前端调试
- 统一的 JSON 错误响应格式

## 📄 License

MIT License
