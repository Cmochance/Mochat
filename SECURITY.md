# 🔐 Mochat 安全架构文档

本文档描述 Mochat 项目的安全架构设计和已实施的安全措施。

## 安全模块清单

| 模块 | 文件 | 功能 |
|------|------|------|
| 密码哈希 | `backend/app/core/security.py` | bcrypt 单向哈希、JWT 创建/验证、SECRET_KEY 强度验证 |
| Cookie 安全 | `backend/app/core/cookie_security.py` | HttpOnly Cookie 管理、Refresh Token 创建/验证/轮转 |
| 输入验证 | `backend/app/core/input_validation.py` | HTML 标签剥离、SQL 注入检测、路径遍历检测、文件名净化 |
| 安全 HTTP 头 | `backend/app/core/security_headers.py` | CSP、HSTS、X-Frame-Options 等安全头中间件 |
| CORS 验证 | `backend/app/core/cors_validation.py` | CORS 来源格式验证、通配符检测、HTTP 告警 |
| 速率限制 | `backend/app/core/rate_limit.py` | slowapi 集成、IP 级精确控制、预定义规则 |
| 安全审计 | `backend/app/core/security_audit.py` | 结构化安全日志、标识脱敏 |
| 错误处理 | `backend/app/core/error_handler.py` | 统一错误响应、堆栈不外泄、验证错误详情 |
| 数据库迁移 | `backend/scripts/migrate_remove_password_encrypted.py` | 清理旧的加密密码数据 |

## 认证流程

```
用户登录 → 后端验证密码（bcrypt）→ 返回 Access Token（body）+ Refresh Token（HttpOnly Cookie）
                                            ↓
Access Token 过期 → 前端自动调用 /auth/refresh → Cookie 自动携带 → 返回新 Access Token + 新 Cookie
                                            ↓
Refresh Token 过期 → 401 → 前端清除认证状态 → 跳转登录页
```

## Token 存储策略

| Token 类型 | Web 端 | 桌面端（Electron） |
|------------|--------|-------------------|
| Access Token | 内存（不持久化） | localStorage |
| Refresh Token | HttpOnly Cookie（JS 不可读） | localStorage |

## 密码策略

- 长度：6~100 位
- 允许字符：字母、数字、常见特殊符号（!@#$%^&*()_+-=）
- 复杂度：至少包含大小写字母、数字中的两种
- 存储：bcrypt 单向哈希

## 速率限制规则

| 端点 | 限制 | 说明 |
|------|------|------|
| 注册 | 5次/小时 | 防止批量注册 |
| 登录 | 10次/分钟 | 防止暴力破解 |
| 密码重置 | 3次/小时 | 防止滥用 |
| 验证码发送 | 10次/分钟 | 防止短信/邮件轰炸 |
| 对话 | 60次/分钟 | 防止 API 滥用 |

## 部署安全检查清单

在部署到生产环境前，确认以下所有项目：

- [ ] SECRET_KEY 已设置为安全随机字符串（至少32字符，三种字符类型）
- [ ] SECRET_KEY 不在 Git 仓库中（.env 已在 .gitignore 中）
- [ ] DATABASE_URL 使用 PostgreSQL（非 SQLite）
- [ ] CORS_ORIGINS 不包含 `*` 或 localhost
- [ ] CORS_ORIGINS 使用 HTTPS 协议
- [ ] DEBUG=false
- [ ] COOKIE_SECURE=true
- [ ] COOKIE_SAMESITE=lax 或 strict
- [ ] HTTPS 已配置（通过反向代理如 Nginx）
- [ ] 已运行 `migrate_remove_password_encrypted.py --execute` 清理旧数据
- [ ] 日志级别设置为 WARNING 或 INFO（非 DEBUG）
- [ ] 定期更新依赖版本

## 升级指南

### 从旧版本（含 password_encrypted）升级

1. 更新代码到最新版本
2. 更新 `.env` 中的 SECRET_KEY 为安全密钥
3. 安装新依赖：`pip install -r requirements.txt`
4. 运行密码清理脚本：`python backend/scripts/migrate_remove_password_encrypted.py --execute`
5. 重启服务

### 从 localStorage Token 迁移到 Cookie

前端代码已自动兼容，无需手动操作。用户下次登录后 Refresh Token 将自动切换到 HttpOnly Cookie 模式。旧的 localStorage 中的 Refresh Token 会在登出时自动清除。
