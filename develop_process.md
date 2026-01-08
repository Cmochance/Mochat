# Mochat 开发过程文档

> 墨聊 Mochat - 水墨风格AI对话平台开发记录

---

## 一、项目概述

### 1.1 项目简介

**Mochat（墨聊）** 是一个水墨风格的 AI 对话平台，采用前后端分离架构，具有以下特点：

- 🎨 **水墨风格 UI**：独特的中国风水墨设计
- 💬 **AI 对话**：支持流式输出，thinking 和内容分离
- 🔐 **完整认证系统**：注册、登录、邮箱验证码、忘记密码
- 👤 **用户隔离**：每个用户独立的聊天空间
- 🛠️ **管理后台**：用户管理、系统统计、模型配置

### 1.2 技术栈

| 层级 | 技术 |
|------|------|
| **前端** | React 18 + TypeScript + Vite + TailwindCSS + Framer Motion + Zustand |
| **后端** | FastAPI + SQLAlchemy 2.0 + SQLite + JWT + bcrypt |
| **邮件服务** | Resend API |
| **部署** | Docker + Docker Compose |

### 1.3 目录结构

```
Mochat/
├── backend/                    # 后端服务
│   ├── app/                   # 主应用
│   │   ├── api/              # API路由
│   │   ├── core/             # 核心配置
│   │   ├── db/               # 数据库
│   │   ├── schemas/          # Pydantic模型
│   │   ├── services/         # 业务逻辑
│   │   └── main.py           # 入口文件
│   ├── verify/               # 验证码模块（独立）
│   │   ├── cache.py          # 内存缓存
│   │   ├── config.py         # 模块配置
│   │   ├── email.py          # 邮件发送
│   │   ├── router.py         # API路由
│   │   ├── schemas.py        # 数据模型
│   │   ├── service.py        # 核心服务
│   │   └── templates/        # 邮件模板
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                   # 前端服务
│   ├── src/
│   │   ├── components/       # 通用组件
│   │   ├── pages/            # 页面组件
│   │   ├── services/         # API服务
│   │   ├── stores/           # 状态管理
│   │   └── types/            # 类型定义
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
├── .env                        # 环境变量（不提交）
└── .env.example               # 环境变量模板
```

---

## 二、开发过程

### 2.1 基础架构搭建

#### 端口配置
- 前端：`3721`
- 后端：`9527`
- 避免与常用端口冲突（80, 81, 443, 5000, 8000, 8081, 8086）

#### 环境变量
统一使用项目根目录 `.env` 文件管理配置：

```env
# 安全配置
SECRET_KEY=your-secret-key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# 数据库
DATABASE_URL=sqlite+aiosqlite:///./mochat.db

# AI模型
AI_API_KEY=xxx
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4

# 验证码模块
RESEND_API_KEY=re_xxx
RESEND_FROM_EMAIL=noreply@auth.mochance.xyz
```

### 2.2 用户认证系统

#### 账户存储
- 用户账号密码存储在 SQLite 数据库 `users` 表
- 密码使用 bcrypt 哈希加密存储
- JWT Token 用于身份验证

#### 密码规则
- 仅支持数字/小写字母/大写字母
- 至少包含其中两种字符类型
- 最少 6 位

#### 默认账号
| 用户名 | 密码 | 角色 |
|--------|------|------|
| mochance | mochance1104 | admin |
| ch337338 | ch337338 | user |

### 2.3 邮箱验证码模块

#### 模块设计原则
- **完全解耦**：独立于主应用，位于 `backend/verify/`
- **易于维护**：单独的配置、缓存、路由
- **安全可靠**：IP限制、发送冷却、错误次数限制

#### API 端点
| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/verify/send` | POST | 发送验证码 |
| `/api/verify/cooldown` | GET | 获取冷却时间 |
| `/api/auth/register` | POST | 注册（需验证码） |
| `/api/auth/reset-password` | POST | 重置密码（需验证码） |

#### 安全限制
| 限制 | 规则 |
|------|------|
| 发送冷却 | 60秒/次 |
| 验证码有效期 | 5分钟 |
| 错误次数 | 5次后锁定30分钟 |
| IP限制 | 10次/小时 |

#### 邮件配置
- 服务商：Resend
- 发件域名：`auth.mochance.xyz`
- 发件邮箱：`noreply@auth.mochance.xyz`

---

## 三、问题与解决方案

### 3.1 Docker 构建问题

#### 问题：npm ci 失败
**错误信息**：
```
npm error code EUSAGE
npm error `npm ci` can only install packages when your package.json and package-lock.json...
```

**原因**：`npm ci` 需要 `package-lock.json` 文件

**解决**：将 Dockerfile 中 `npm ci` 改为 `npm install`

---

#### 问题：TypeScript 编译错误
**错误信息**：
```
error TS6133: 'MessageSquare' is declared but its value is never read.
error TS6133: 'Paperclip' is declared but its value is never read.
```

**解决**：删除未使用的 import 语句

---

### 3.2 数据库问题

#### 问题：无法打开数据库文件
**错误信息**：
```
sqlite3.OperationalError: unable to open database file
```

**原因**：Docker 卷挂载覆盖了应用目录

**解决**：修改 docker-compose.yml，使用独立数据目录：
```yaml
volumes:
  - mochat_data:/data
environment:
  - DATABASE_URL=sqlite+aiosqlite:////data/mochat.db
```

---

### 3.3 bcrypt 兼容性问题

#### 问题：bcrypt 模块错误
**错误信息**：
```
AttributeError: module 'bcrypt' has no attribute '__about__'
ValueError: password cannot be longer than 72 bytes
```

**原因**：`passlib[bcrypt]` 与最新版 bcrypt 不兼容

**解决**：在 requirements.txt 中固定版本：
```
passlib==1.7.4
bcrypt==4.0.1
```

---

### 3.4 JWT 验证失败

#### 问题：Token 无法解码
**错误信息**：
```
jose.exceptions.JWTClaimsError: Subject must be a string.
```

**原因**：python-jose 要求 `sub` claim 必须是字符串，而代码传入了整数

**解决**：

1. 生成 token 时转为字符串：
```python
# auth_service.py
data={"sub": str(user.id), ...}
```

2. 解码时转回整数：
```python
# dependencies.py
user_id_str = payload.get("sub")
user_id = int(user_id_str)
```

---

### 3.5 邮箱验证错误

#### 问题：邮箱格式验证失败
**错误信息**：
```
value is not a valid email address: The part after the @-sign is a special-use or reserved name
```

**原因**：`.local` 域名被认为是无效邮箱

**解决**：将默认邮箱从 `xxx@mochat.local` 改为 `xxx@mochat.com`

---

### 3.6 环境变量问题

#### 问题：Docker 容器内环境变量不生效

**原因**：docker-compose.yml 中未配置对应的环境变量传递

**解决**：在 docker-compose.yml 中显式配置：
```yaml
environment:
  - RESEND_API_KEY=${RESEND_API_KEY:-}
  - RESEND_FROM_EMAIL=${RESEND_FROM_EMAIL:-noreply@auth.mochance.xyz}
```

---

## 四、API 文档

### 4.1 认证相关

#### 发送验证码
```http
POST /api/verify/send
Content-Type: application/json

{
  "email": "user@example.com",
  "purpose": "register"  // 或 "reset_password"
}
```

#### 用户注册
```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "newuser",
  "email": "user@example.com",
  "password": "Password123",
  "code": "123456"
}
```

#### 用户登录
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "mochance",
  "password": "mochance1104"
}
```

#### 重置密码
```http
POST /api/auth/reset-password
Content-Type: application/json

{
  "email": "user@example.com",
  "code": "123456",
  "new_password": "NewPassword123"
}
```

### 4.2 管理接口

#### 获取系统统计
```http
GET /api/admin/stats
Authorization: Bearer <admin_token>
```

#### 获取用户列表
```http
GET /api/admin/users
Authorization: Bearer <admin_token>
```

---

## 五、部署指南

### 5.1 环境准备

1. 安装 Docker 和 Docker Compose
2. 复制环境变量文件：
   ```bash
   cp .env.example .env
   ```
3. 编辑 `.env` 填入实际配置

### 5.2 构建和启动

```bash
# 构建镜像
docker compose build

# 启动服务
docker compose up -d

# 查看日志
docker logs mochat-backend-1 -f
```

### 5.3 访问地址

- 前端：http://localhost:3721
- 后端 API：http://localhost:9527
- 管理后台：http://localhost:3721/admin（需管理员登录）

---

## 六、待办事项

- [ ] 添加 Redis 缓存支持（生产环境）
- [ ] 完善 AI 对话功能
- [ ] 添加会话导出功能
- [ ] 添加多语言支持
- [ ] 添加深色模式切换

---

## 七、更新日志

### v1.0.0 (2026-01-09)

- ✅ 完成基础架构搭建
- ✅ 实现用户认证系统
- ✅ 实现邮箱验证码模块
- ✅ 实现忘记密码功能
- ✅ 修复 JWT 验证问题
- ✅ 修复 bcrypt 兼容性问题
- ✅ 添加 Docker 部署支持

---

*文档最后更新：2026年1月9日*
