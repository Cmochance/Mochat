"""
Mochat 后端应用入口
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.config import settings
from .db.database import init_db, close_db
from .api import api_router
from .services.auth_service import AuthService
from .db.database import AsyncSessionLocal

# 导入验证码模块
import sys
from pathlib import Path
# 添加 verify 模块到路径
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from verify import verify_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时初始化数据库
    await init_db()
    
    # 创建默认账号（管理员和普通用户）
    async with AsyncSessionLocal() as db:
        await AuthService.create_default_users(db)
        await db.commit()
    
    yield
    
    # 关闭时清理资源
    await close_db()


# 创建FastAPI应用
app = FastAPI(
    title="Mochat API",
    description="水墨风格AI对话平台后端API",
    version="1.0.0",
    lifespan=lifespan
)

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(api_router, prefix="/api")

# 注册验证码模块路由
app.include_router(verify_router, prefix="/api")


@app.get("/")
async def root():
    """根路径"""
    return {
        "name": "Mochat API",
        "version": "1.0.0",
        "description": "水墨风格AI对话平台"
    }


@app.get("/health")
async def health_check():
    """健康检查"""
    return {"status": "healthy"}


@app.get("/debug/users")
async def debug_users():
    """调试：列出所有用户（仅开发环境使用）"""
    from .db.database import AsyncSessionLocal
    from .db import crud
    
    async with AsyncSessionLocal() as db:
        users = await crud.get_all_users(db)
        return {
            "count": len(users),
            "users": [
                {
                    "id": u.id,
                    "username": u.username,
                    "email": u.email,
                    "role": u.role,
                    "is_active": u.is_active
                }
                for u in users
            ]
        }
