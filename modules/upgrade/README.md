# Upgrade 模块 - 版本更新通知

独立的版本更新通知模块，用于向用户展示应用的版本更新历史。

## 功能特性

- 用户首次登录或有新版本时显示版本更新弹窗
- 记录用户已阅读的版本，避免重复提示
- 完全解耦的独立模块，可复用于其他项目

## 目录结构

```
modules/upgrade/
├── backend/
│   ├── __init__.py
│   ├── config.py          # 配置
│   ├── version_data.py    # 版本历史数据（修改此文件更新版本）
│   ├── main.py            # FastAPI 服务
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── types.ts           # 类型定义
│   ├── useVersion.ts      # React Hook
│   ├── VersionModal.tsx   # 弹窗组件
│   └── index.ts           # 导出入口
└── README.md
```

## 后端 API

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/version` | GET | 获取版本信息（需认证） |
| `/api/version/ack` | POST | 确认已阅读版本 |
| `/api/version/current` | GET | 获取当前版本号（无需认证） |

## 前端使用

### 1. 配置路径别名

在 `tsconfig.json` 中添加：

```json
{
  "compilerOptions": {
    "paths": {
      "@upgrade": ["../modules/upgrade/frontend/index.ts"]
    }
  }
}
```

在 `vite.config.ts` 中添加：

```typescript
resolve: {
  alias: {
    '@upgrade': path.resolve(__dirname, '../modules/upgrade/frontend'),
  },
}
```

### 2. 使用组件

```tsx
import { useVersion, VersionModal } from '@upgrade'

function Chat() {
  const { versionInfo, showModal, closeModal } = useVersion()

  return (
    <div>
      {showModal && (
        <VersionModal versionInfo={versionInfo} onClose={closeModal} />
      )}
      {/* 其他内容 */}
    </div>
  )
}
```

### 3. 显示版本号

```tsx
import { getCurrentVersion } from '@upgrade'

// 在组件中
const [version, setVersion] = useState('v1.0')
useEffect(() => {
  getCurrentVersion().then(setVersion)
}, [])

// 渲染
<span>{version}</span>
```

## 更新版本

1. 编辑 `backend/version_data.py`
2. 更新 `CURRENT_VERSION` 常量
3. 在 `VERSION_HISTORY` 数组中添加新版本记录
4. 重新部署服务

```python
CURRENT_VERSION = "v1.4"

VERSION_HISTORY = [
    # ... 历史版本
    {
        "version": "v1.4",
        "description": "新版本功能描述"
    },
]
```

## Docker 部署

服务默认运行在 3902 端口，通过环境变量配置：

- `UPGRADE_PORT`: 服务端口（默认 3902）
- `UPGRADE_CORS_ORIGINS`: 允许的跨域来源
- `CURRENT_VERSION`: 当前版本号

## 依赖

### 后端
- FastAPI
- httpx（用于调用主后端 API）

### 前端
- React
- framer-motion
- lucide-react
