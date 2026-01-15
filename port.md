# Mochat 端口配置总览

本文档记录项目中所有服务使用的端口，便于维护和避免冲突。

## 端口分配规则

- **核心服务**: 9000-9999
- **功能模块（内部）**: 3900-3999
- **功能模块（外部映射）**: 30000-40000
- **前端服务**: 3721 (内部), 38721 (外部)

---

## 服务端口列表

| 服务名称 | 内部端口 | 外部端口 | 环境变量 | 描述 |
|----------|----------|----------|----------|------|
| **backend** | 9527 | 9527 | - | 主后端 API 服务 |
| **frontend** | 3721 | 38721 | - | 前端 Web 服务 (Nginx) |
| **uppic** | 3900 | 13900 | `UPPIC_PORT` | 图片上传服务 |
| **upword** | 3901 | 13901 | `UPWORD_PORT` | 文档上传解析服务 |
| **upgrade** | 3902 | 13902 | `UPGRADE_PORT` | 版本更新通知服务 |
| **picgenerate** | 3903 | 30903 | `PICGEN_PORT` | AI 图像生成服务 |

---

## 访问地址

### 本地开发

| 服务 | URL |
|------|-----|
| 前端 | http://localhost:5173 (Vite) 或 http://localhost:38721 (Docker) |
| 后端 API | http://localhost:9527 |
| 图片上传 | http://localhost:13900 |
| 文档上传 | http://localhost:13901 |
| 版本服务 | http://localhost:13902 |
| 图像生成 | http://localhost:30903 |

### 生产环境

通过 Nginx 反向代理统一入口，各服务通过路径区分：
- `/api/*` → backend:9527
- `/uppic/*` → uppic:3900
- `/upword/*` → upword:3901
- `/upgrade/*` → upgrade:3902
- `/picgen/*` → picgenerate:3903

---

## 端口冲突检查

添加新服务前，请确认端口未被占用：

```bash
# Windows
netstat -ano | findstr "端口号"

# Linux/Mac
lsof -i :端口号
```

---

## 更新记录

| 日期 | 变更 |
|------|------|
| 2026-01-15 | 初始创建，添加 picgenerate 服务 (30903) |
